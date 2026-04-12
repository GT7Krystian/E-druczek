import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { KsefApiClient } from './ksef-api.client';
import { KsefCryptoService } from './ksef-crypto.service';

export interface KsefSession {
  accessToken: string;
  refreshToken: string;
  sessionRefNr: string;
  sessionValidUntil: string;
  aesKey: Buffer;
  iv: Buffer;
  nip: string;
  companyId: string;
}

const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes
const AUTH_POLL_INTERVAL_MS = 1000; // 1 second
const AUTH_POLL_MAX_ATTEMPTS = 30; // max 30 seconds

@Injectable()
export class KsefSessionService implements OnModuleDestroy {
  private readonly logger = new Logger(KsefSessionService.name);
  private readonly redis: Redis;

  /** In-memory cache of open sessions keyed by companyId. */
  private readonly sessions = new Map<string, KsefSession>();

  constructor(
    private readonly api: KsefApiClient,
    private readonly crypto: KsefCryptoService,
    private readonly config: ConfigService,
  ) {
    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST') ?? 'localhost',
      port: config.get<number>('REDIS_PORT') ?? 6379,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  /**
   * Full session lifecycle:
   * 1. Acquire Redis mutex for companyId
   * 2. Authenticate with challenge + token
   * 3. Poll auth status → redeem tokens
   * 4. Open online session (generate AES key)
   * 5. Return KsefSession
   *
   * Throws if lock already held (another send in progress).
   */
  async openSession(
    companyId: string,
    nip: string,
    ksefToken: string,
  ): Promise<KsefSession> {
    // ─── 1. Acquire mutex ─────────────────────────────────
    const lockKey = `ksef:lock:${companyId}`;
    const acquired = await this.redis.set(
      lockKey,
      '1',
      'PX',
      LOCK_TTL_MS,
      'NX',
    );
    if (!acquired) {
      throw new Error(
        `KSeF session already in progress for company ${companyId}`,
      );
    }
    this.logger.log(`Lock acquired for company ${companyId}`);

    try {
      // ─── 2. Challenge + Auth ──────────────────────────────
      const { challenge, timestampMs } = await this.api.authChallenge();
      this.logger.debug(`Challenge: ${challenge}`);

      const encryptedToken = this.crypto.encryptToken(ksefToken, timestampMs);

      const authResult = await this.api.authKsefToken(
        challenge,
        nip,
        encryptedToken,
      );
      const operationToken = authResult.authenticationToken.token;
      const authRefNr = authResult.referenceNumber;
      this.logger.debug(`Auth ref: ${authRefNr}`);

      // ─── 3. Poll auth status ──────────────────────────────
      await this.pollAuthStatus(authRefNr, operationToken);
      this.logger.log('Auth successful');

      // ─── 4. Redeem tokens ─────────────────────────────────
      const tokens = await this.api.tokenRedeem(operationToken);
      const accessToken = tokens.accessToken.token;
      const refreshToken = tokens.refreshToken.token;

      // ─── 5. Open online session ───────────────────────────
      const { aesKey, iv, encryptedSymmetricKey, initializationVector } =
        this.crypto.generateSessionKey();

      const session = await this.api.sessionOpen(
        accessToken,
        encryptedSymmetricKey,
        initializationVector,
      );

      const ksefSession: KsefSession = {
        accessToken,
        refreshToken,
        sessionRefNr: session.referenceNumber,
        sessionValidUntil: session.validUntil,
        aesKey,
        iv,
        nip,
        companyId,
      };

      this.sessions.set(companyId, ksefSession);
      this.logger.log(
        `Session opened: ${session.referenceNumber} (valid until ${session.validUntil})`,
      );
      return ksefSession;
    } catch (err) {
      // Release lock on failure
      await this.redis.del(lockKey);
      throw err;
    }
  }

  /**
   * Close the online session and release the Redis mutex.
   */
  async closeSession(companyId: string): Promise<void> {
    const session = this.sessions.get(companyId);
    if (!session) {
      this.logger.warn(`No active session for company ${companyId}`);
      return;
    }

    try {
      await this.api.sessionClose(session.sessionRefNr, session.accessToken);
      this.logger.log(`Session ${session.sessionRefNr} closed`);
    } finally {
      this.sessions.delete(companyId);
      await this.redis.del(`ksef:lock:${companyId}`);
      this.logger.log(`Lock released for company ${companyId}`);
    }
  }

  /** Get cached session for a company (if open). */
  getSession(companyId: string): KsefSession | undefined {
    return this.sessions.get(companyId);
  }

  /** Terminate the auth session (logout). */
  async terminateAuth(companyId: string): Promise<void> {
    const session = this.sessions.get(companyId);
    if (!session) return;
    try {
      await this.api.authTerminate(session.accessToken);
    } finally {
      this.sessions.delete(companyId);
      await this.redis.del(`ksef:lock:${companyId}`);
    }
  }

  // ─── Private helpers ────────────────────────────────────

  private async pollAuthStatus(
    referenceNumber: string,
    operationToken: string,
  ): Promise<void> {
    for (let attempt = 0; attempt < AUTH_POLL_MAX_ATTEMPTS; attempt++) {
      const status = await this.api.authStatus(referenceNumber, operationToken);
      if (status.status.code === 200) return;
      if (status.status.code >= 400) {
        throw new Error(
          `KSeF auth failed: ${status.status.code} — ${status.status.description}`,
        );
      }
      // code 100 = still processing
      await this.sleep(AUTH_POLL_INTERVAL_MS);
    }
    throw new Error(
      `KSeF auth polling timed out after ${AUTH_POLL_MAX_ATTEMPTS}s`,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
