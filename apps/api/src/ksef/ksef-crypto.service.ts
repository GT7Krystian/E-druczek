import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createPublicKey,
  publicEncrypt,
  randomBytes,
  createCipheriv,
  createHash,
  constants,
  KeyObject,
} from 'crypto';

/**
 * Handles all KSeF-related cryptography:
 * - RSA-OAEP (SHA-256) encryption of tokens and AES keys
 * - AES-256-CBC encryption of invoice XML
 * - SHA-256 hashing
 *
 * KSeF uses TWO separate public key certificates:
 * - KsefTokenEncryption: for encrypting auth tokens
 * - SymmetricKeyEncryption: for encrypting AES session keys
 */
@Injectable()
export class KsefCryptoService implements OnModuleInit {
  private readonly logger = new Logger(KsefCryptoService.name);
  private tokenKey: KeyObject | null = null;
  private symmetricKey: KeyObject | null = null;
  private readonly ksefApiUrl: string;

  constructor(private readonly config: ConfigService) {
    this.ksefApiUrl =
      config.get<string>('KSEF_API_URL') ??
      'https://api-test.ksef.mf.gov.pl/v2';
  }

  async onModuleInit(): Promise<void> {
    await this.fetchPublicKeys();
  }

  /** Fetch both MF public keys from KSeF API and cache them. */
  async fetchPublicKeys(): Promise<void> {
    try {
      const url = `${this.ksefApiUrl}/security/public-key-certificates`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const certs = (await res.json()) as Array<{
        certificate: string;
        validFrom: string;
        validTo: string;
        usage: string[];
      }>;

      const now = new Date();
      const findCert = (usage: string) =>
        certs.find(
          (c) =>
            new Date(c.validFrom) <= now &&
            new Date(c.validTo) >= now &&
            c.usage.includes(usage),
        );

      const tokenCert = findCert('KsefTokenEncryption');
      const symCert = findCert('SymmetricKeyEncryption');

      if (tokenCert) {
        this.tokenKey = createPublicKey(
          `-----BEGIN CERTIFICATE-----\n${tokenCert.certificate}\n-----END CERTIFICATE-----`,
        );
        this.logger.log(
          `KSeF token encryption key loaded (valid until ${tokenCert.validTo})`,
        );
      } else {
        this.logger.warn('No valid KsefTokenEncryption certificate found');
      }

      if (symCert) {
        this.symmetricKey = createPublicKey(
          `-----BEGIN CERTIFICATE-----\n${symCert.certificate}\n-----END CERTIFICATE-----`,
        );
        this.logger.log(
          `KSeF symmetric key encryption cert loaded (valid until ${symCert.validTo})`,
        );
      } else {
        this.logger.warn(
          'No valid SymmetricKeyEncryption certificate found',
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to fetch KSeF public keys: ${(err as Error).message}`,
      );
    }
  }

  /**
   * RSA-OAEP (SHA-256) encrypt with the specified key.
   */
  private rsaEncryptWith(key: KeyObject, plaintext: Buffer): string {
    const encrypted = publicEncrypt(
      {
        key,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      plaintext,
    );
    return encrypted.toString('base64');
  }

  /**
   * Encrypt KSeF token for /auth/ksef-token.
   * Uses KsefTokenEncryption certificate.
   * Format: `{ksefToken}|{timestampMs}` → RSA-OAEP → base64
   */
  encryptToken(ksefToken: string, timestampMs: number): string {
    if (!this.tokenKey) {
      throw new Error('KSeF token encryption key not loaded');
    }
    const plaintext = Buffer.from(`${ksefToken}|${timestampMs}`, 'utf-8');
    return this.rsaEncryptWith(this.tokenKey, plaintext);
  }

  /**
   * Generate a random AES-256 key and IV for session encryption.
   * Uses SymmetricKeyEncryption certificate to encrypt the AES key.
   */
  generateSessionKey(): {
    aesKey: Buffer;
    iv: Buffer;
    encryptedSymmetricKey: string;
    initializationVector: string;
  } {
    if (!this.symmetricKey) {
      throw new Error('KSeF symmetric key encryption cert not loaded');
    }
    const aesKey = randomBytes(32); // AES-256
    const iv = randomBytes(16); // CBC IV
    const encryptedSymmetricKey = this.rsaEncryptWith(this.symmetricKey, aesKey);
    const initializationVector = iv.toString('base64');
    return { aesKey, iv, encryptedSymmetricKey, initializationVector };
  }

  /**
   * AES-256-CBC encrypt invoice XML.
   */
  encryptInvoice(
    xml: string,
    aesKey: Buffer,
    iv: Buffer,
  ): {
    encryptedInvoiceContent: string;
    invoiceHash: string;
    invoiceSize: number;
    encryptedInvoiceHash: string;
    encryptedInvoiceSize: number;
  } {
    const plainBuffer = Buffer.from(xml, 'utf-8');
    const invoiceHash = this.sha256Base64(plainBuffer);
    const invoiceSize = plainBuffer.length;

    const cipher = createCipheriv('aes-256-cbc', aesKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(plainBuffer),
      cipher.final(),
    ]);

    const encryptedInvoiceHash = this.sha256Base64(encrypted);
    const encryptedInvoiceSize = encrypted.length;
    const encryptedInvoiceContent = encrypted.toString('base64');

    return {
      encryptedInvoiceContent,
      invoiceHash,
      invoiceSize,
      encryptedInvoiceHash,
      encryptedInvoiceSize,
    };
  }

  /** SHA-256 hash → base64 */
  private sha256Base64(data: Buffer): string {
    return createHash('sha256').update(data).digest('base64');
  }

  /** Check if both keys are loaded and ready. */
  isReady(): boolean {
    return this.tokenKey !== null && this.symmetricKey !== null;
  }
}
