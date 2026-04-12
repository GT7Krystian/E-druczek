import { Injectable, Logger } from '@nestjs/common';
import { KsefApiClient } from './ksef-api.client';

export interface KsefInvoiceResult {
  ksefNumber: string;
  invoiceRefNr: string;
  upoDownloadUrl: string;
  permanentStorageDate: string;
}

export interface KsefSessionStatusResult {
  code: number;
  description: string;
  invoiceCount: number;
  successfulInvoiceCount: number;
  failedInvoiceCount: number;
  upoPages: Array<{
    referenceNumber: string;
    downloadUrl: string;
  }>;
}

const UPO_POLL_INTERVAL_MS = 5_000; // 5 seconds
const UPO_POLL_MAX_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Polls KSeF for session/UPO status after invoices are sent.
 * Maps KSeF status codes to internal statuses.
 */
@Injectable()
export class KsefStatusService {
  private readonly logger = new Logger(KsefStatusService.name);

  constructor(private readonly api: KsefApiClient) {}

  /**
   * Poll session status until processing is complete (code 200)
   * or timeout (→ PROCESSING_TIMEOUT).
   *
   * @returns Session status with UPO information.
   * @throws Error on timeout or API failure.
   */
  async pollUntilComplete(
    sessionRefNr: string,
    accessToken: string,
  ): Promise<KsefSessionStatusResult> {
    const startTime = Date.now();

    while (Date.now() - startTime < UPO_POLL_MAX_MS) {
      const result = await this.api.sessionStatus(sessionRefNr, accessToken);

      this.logger.debug(
        `Session ${sessionRefNr} status: ${result.status.code} ` +
          `(${result.successfulInvoiceCount}/${result.invoiceCount} ok)`,
      );

      if (result.status.code === 200) {
        return {
          code: result.status.code,
          description: result.status.description,
          invoiceCount: result.invoiceCount,
          successfulInvoiceCount: result.successfulInvoiceCount,
          failedInvoiceCount: result.failedInvoiceCount,
          upoPages: (result.upo?.pages ?? []).map((p) => ({
            referenceNumber: p.referenceNumber,
            downloadUrl: p.downloadUrl,
          })),
        };
      }

      if (result.status.code >= 400) {
        throw new Error(
          `KSeF session failed: ${result.status.code} — ${result.status.description}`,
        );
      }

      // Still processing (code 100)
      await this.sleep(UPO_POLL_INTERVAL_MS);
    }

    throw new Error(
      `KSeF UPO polling timed out after ${UPO_POLL_MAX_MS / 60000} minutes ` +
        `for session ${sessionRefNr}`,
    );
  }

  /**
   * Fetch all invoice results from a completed session.
   * Returns ksefNumber for each accepted invoice.
   */
  async getInvoiceResults(
    sessionRefNr: string,
    accessToken: string,
  ): Promise<KsefInvoiceResult[]> {
    const result = await this.api.sessionInvoices(
      sessionRefNr,
      accessToken,
    );

    return result.invoices.map((inv) => ({
      ksefNumber: inv.ksefNumber,
      invoiceRefNr: inv.referenceNumber,
      upoDownloadUrl: inv.upoDownloadUrl,
      permanentStorageDate: inv.permanentStorageDate,
    }));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
