import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Low-level HTTP client for KSeF REST API v2.
 * All methods return raw JSON or throw on HTTP errors.
 */
@Injectable()
export class KsefApiClient {
  private readonly logger = new Logger(KsefApiClient.name);
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl =
      config.get<string>('KSEF_API_URL') ??
      'https://api-demo.ksef.mf.gov.pl/v2';
  }

  // ─── Auth endpoints ────────────────────────────────────

  /** POST /auth/challenge → { challenge, timestamp, timestampMs, clientIp } */
  async authChallenge(): Promise<{
    challenge: string;
    timestamp: string;
    timestampMs: number;
    clientIp: string;
  }> {
    return this.post('/auth/challenge', {});
  }

  /**
   * POST /auth/ksef-token → { referenceNumber, authenticationToken }
   * @param challenge - challenge from /auth/challenge
   * @param nip - NIP to authenticate as
   * @param encryptedToken - RSA-encrypted "token|timestampMs"
   */
  async authKsefToken(
    challenge: string,
    nip: string,
    encryptedToken: string,
  ): Promise<{
    referenceNumber: string;
    authenticationToken: {
      token: string;
      validUntil: string;
    };
  }> {
    return this.post('/auth/ksef-token', {
      challenge,
      contextIdentifier: {
        type: 'Nip',
        value: nip,
      },
      encryptedToken,
    });
  }

  /**
   * GET /auth/{referenceNumber} → auth status
   * Poll until status.code === 200.
   */
  async authStatus(
    referenceNumber: string,
    operationToken: string,
  ): Promise<{
    startDate: string;
    authenticationMethod: string;
    status: { code: number; description: string };
  }> {
    return this.get(`/auth/${referenceNumber}`, operationToken);
  }

  /**
   * POST /auth/token/redeem → accessToken + refreshToken
   * Call after auth status.code === 200.
   */
  async tokenRedeem(operationToken: string): Promise<{
    accessToken: { token: string; validUntil: string };
    refreshToken: { token: string; validUntil: string };
  }> {
    return this.post('/auth/token/redeem', {}, operationToken);
  }

  /** POST /auth/token/refresh → new accessToken */
  async tokenRefresh(refreshToken: string): Promise<{
    accessToken: { token: string; validUntil: string };
    refreshToken: { token: string; validUntil: string };
  }> {
    return this.post('/auth/token/refresh', {}, refreshToken);
  }

  /** DELETE /auth/sessions/current */
  async authTerminate(accessToken: string): Promise<void> {
    await this.delete('/auth/sessions/current', accessToken);
  }

  // ─── Online session endpoints ──────────────────────────

  /**
   * POST /sessions/online → open session
   * Returns session reference number.
   */
  async sessionOpen(
    accessToken: string,
    encryptedSymmetricKey: string,
    initializationVector: string,
  ): Promise<{
    referenceNumber: string;
    validUntil: string;
  }> {
    return this.post(
      '/sessions/online',
      {
        formCode: {
          systemCode: 'FA (3)',
          schemaVersion: '1-0E',
          value: 'FA',
        },
        encryption: {
          encryptedSymmetricKey,
          initializationVector,
        },
      },
      accessToken,
    );
  }

  /**
   * POST /sessions/online/{ref}/invoices → send encrypted invoice
   * Returns invoice reference number.
   */
  async sendInvoice(
    sessionRefNr: string,
    accessToken: string,
    payload: {
      invoiceHash: string;
      invoiceSize: number;
      encryptedInvoiceHash: string;
      encryptedInvoiceSize: number;
      encryptedInvoiceContent: string;
      offlineMode: boolean;
    },
  ): Promise<{ referenceNumber: string }> {
    return this.post(
      `/sessions/online/${sessionRefNr}/invoices`,
      payload,
      accessToken,
    );
  }

  /** POST /sessions/online/{ref}/close → close session */
  async sessionClose(
    sessionRefNr: string,
    accessToken: string,
  ): Promise<void> {
    await this.postNoBody(`/sessions/online/${sessionRefNr}/close`, accessToken);
  }

  // ─── Status / UPO endpoints ────────────────────────────

  /** GET /sessions/{ref} → session status + UPO */
  async sessionStatus(
    sessionRefNr: string,
    accessToken: string,
  ): Promise<{
    status: { code: number; description: string };
    dateCreated: string;
    dateUpdated: string;
    upo?: {
      pages: Array<{
        referenceNumber: string;
        downloadUrl: string;
        downloadUrlExpirationDate: string;
      }>;
    };
    invoiceCount: number;
    successfulInvoiceCount: number;
    failedInvoiceCount: number;
  }> {
    return this.get(`/sessions/${sessionRefNr}`, accessToken);
  }

  /** GET /sessions/{ref}/invoices → list of invoices with ksefNumber */
  async sessionInvoices(
    sessionRefNr: string,
    accessToken: string,
    pageSize = 100,
  ): Promise<{
    continuationToken?: string;
    invoices: Array<{
      ordinalNumber: number;
      invoiceNumber: string;
      ksefNumber: string;
      referenceNumber: string;
      invoiceHash: string;
      acquisitionDate: string;
      permanentStorageDate: string;
      upoDownloadUrl: string;
    }>;
  }> {
    return this.get(
      `/sessions/${sessionRefNr}/invoices?pageSize=${pageSize}`,
      accessToken,
    );
  }

  // ─── Public key endpoint ───────────────────────────────

  /** GET /security/public-key-certificates */
  async getPublicKeyCertificates(): Promise<
    Array<{
      certificate: string;
      validFrom: string;
      validTo: string;
      usage: string[];
    }>
  > {
    return this.get('/security/public-key-certificates');
  }

  // ─── HTTP helpers ──────────────────────────────────────

  private async post<T>(
    path: string,
    body: unknown,
    bearerToken?: string,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (bearerToken) {
      headers['Authorization'] = `Bearer ${bearerToken}`;
    }

    this.logger.debug(`POST ${path}`);
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`KSeF POST ${path} failed: ${res.status} ${text}`);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  private async postNoBody(path: string, bearerToken: string): Promise<void> {
    const url = `${this.baseUrl}${path}`;
    this.logger.debug(`POST ${path} (no body)`);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`KSeF POST ${path} failed: ${res.status} ${text}`);
    }
  }

  private async get<T>(path: string, bearerToken?: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (bearerToken) {
      headers['Authorization'] = `Bearer ${bearerToken}`;
    }
    this.logger.debug(`GET ${path}`);
    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`KSeF GET ${path} failed: ${res.status} ${text}`);
    }
    return res.json() as Promise<T>;
  }

  private async delete(path: string, bearerToken: string): Promise<void> {
    const url = `${this.baseUrl}${path}`;
    this.logger.debug(`DELETE ${path}`);
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`KSeF DELETE ${path} failed: ${res.status} ${text}`);
    }
  }
}
