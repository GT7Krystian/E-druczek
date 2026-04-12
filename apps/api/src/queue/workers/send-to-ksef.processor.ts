import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import { Job, Queue } from 'bull';
import { SupabaseClient } from '@supabase/supabase-js';
import { KsefStatus, InvoiceTarget } from '@e-druczek/shared';
import { SUPABASE_CLIENT } from '../../supabase/supabase.module';
import { KsefSessionService } from '../../ksef/ksef-session.service';
import { KsefSendService } from '../../ksef/ksef-send.service';
import { DlqService } from '../dlq.service';

export interface SendToKsefJobData {
  documentId: string;
}

/**
 * Sends a single invoice to KSeF.
 * concurrency: 1 — only one KSeF operation at a time.
 *
 * Flow: open session → send invoice → close session → enqueue check-status-upo
 */
@Processor('send-to-ksef')
export class SendToKsefProcessor {
  private readonly logger = new Logger(SendToKsefProcessor.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly ksefSession: KsefSessionService,
    private readonly ksefSend: KsefSendService,
    private readonly dlq: DlqService,
    @InjectQueue('check-status-upo') private readonly checkStatusQueue: Queue,
  ) {}

  @Process({ concurrency: 1 })
  async handle(job: Job<SendToKsefJobData>): Promise<void> {
    const { documentId } = job.data;
    this.logger.log(`Sending document ${documentId} to KSeF`);

    try {
      // 1. Fetch document + company + ksef connection
      const { data: doc, error: docErr } = await this.supabase
        .from('documents')
        .select('id, company_id, xml_url, xml_hash, invoice_target, idempotency_key')
        .eq('id', documentId)
        .single();
      if (docErr || !doc) throw new Error(`Document not found: ${documentId}`);
      if (!doc.xml_url) throw new Error(`No XML for document ${documentId}`);

      // B2C documents should never reach KSeF
      if (doc.invoice_target === InvoiceTarget.B2C) {
        this.logger.warn(`Skipping B2C document ${documentId}`);
        return;
      }

      const { data: company, error: compErr } = await this.supabase
        .from('companies')
        .select('id, nip')
        .eq('id', doc.company_id)
        .single();
      if (compErr || !company) throw new Error(`Company not found: ${doc.company_id}`);

      // Get KSeF token from connection
      const { data: conn, error: connErr } = await this.supabase
        .from('company_ksef_connections')
        .select('ksef_token_encrypted')
        .eq('company_id', doc.company_id)
        .single();
      if (connErr || !conn?.ksef_token_encrypted) {
        throw new Error(`No KSeF token for company ${doc.company_id}`);
      }

      // 2. Download XML from storage
      const { data: blob, error: dlErr } = await this.supabase.storage
        .from('documents')
        .download(doc.xml_url);
      if (dlErr || !blob) throw new Error(`XML download failed: ${dlErr?.message}`);
      const xml = await blob.text();

      // 3. Update status to PROCESSING
      await this.updateStatus(documentId, KsefStatus.PROCESSING);

      // 4. Open KSeF session
      const session = await this.ksefSession.openSession(
        company.id,
        company.nip,
        conn.ksef_token_encrypted,
      );

      try {
        // 5. Send invoice
        const sendResult = await this.ksefSend.send(session, xml);
        this.logger.log(
          `Invoice ${documentId} sent, ref: ${sendResult.invoiceRefNr}`,
        );

        // 6. Close session
        await this.ksefSession.closeSession(company.id);

        // 7. Enqueue status check with session details
        await this.checkStatusQueue.add(
          {
            documentId,
            sessionRefNr: session.sessionRefNr,
            accessToken: session.accessToken,
            companyId: company.id,
          },
          { attempts: 1 },
        );
      } catch (sendErr) {
        // Try to close session on failure
        try {
          await this.ksefSession.closeSession(company.id);
        } catch {
          /* swallow close error */
        }
        throw sendErr;
      }
    } catch (err) {
      const error = err as Error;
      this.logger.error(`send-to-ksef failed for ${documentId}: ${error.message}`);

      await this.updateStatus(documentId, KsefStatus.SEND_FAILED);
      await this.dlq.record({
        document_id: documentId,
        queue_name: 'send-to-ksef',
        job_id: String(job.id),
        step: 'send-to-ksef',
        error_message: error.message,
        error_stack: error.stack,
        retry_count: job.attemptsMade,
      });
      throw err;
    }
  }

  private async updateStatus(documentId: string, status: KsefStatus) {
    await this.supabase
      .from('documents')
      .update({ ksef_status: status })
      .eq('id', documentId);
  }
}
