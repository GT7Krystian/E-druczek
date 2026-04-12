import { Injectable, Logger } from '@nestjs/common';
import { KsefApiClient } from './ksef-api.client';
import { KsefCryptoService } from './ksef-crypto.service';
import { KsefSession } from './ksef-session.service';

export interface InvoiceSendResult {
  invoiceRefNr: string;
}

/**
 * Encrypts and sends invoice XML to KSeF within an open session.
 */
@Injectable()
export class KsefSendService {
  private readonly logger = new Logger(KsefSendService.name);

  constructor(
    private readonly api: KsefApiClient,
    private readonly crypto: KsefCryptoService,
  ) {}

  /**
   * Encrypt invoice XML with session's AES key and send to KSeF.
   * Returns the invoice reference number (used for status tracking).
   */
  async send(session: KsefSession, xml: string): Promise<InvoiceSendResult> {
    // Encrypt
    const {
      encryptedInvoiceContent,
      invoiceHash,
      invoiceSize,
      encryptedInvoiceHash,
      encryptedInvoiceSize,
    } = this.crypto.encryptInvoice(xml, session.aesKey, session.iv);

    this.logger.debug(
      `Sending invoice: ${invoiceSize} bytes → ${encryptedInvoiceSize} bytes encrypted`,
    );

    // Send
    const result = await this.api.sendInvoice(
      session.sessionRefNr,
      session.accessToken,
      {
        invoiceHash,
        invoiceSize,
        encryptedInvoiceHash,
        encryptedInvoiceSize,
        encryptedInvoiceContent,
        offlineMode: false,
      },
    );

    this.logger.log(`Invoice sent, ref: ${result.referenceNumber}`);
    return { invoiceRefNr: result.referenceNumber };
  }
}
