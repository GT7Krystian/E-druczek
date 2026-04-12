import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import { Job, Queue } from 'bull';
import { SupabaseClient } from '@supabase/supabase-js';
import { KsefStatus, PdfStatus } from '@e-druczek/shared';
import { SUPABASE_CLIENT } from '../../supabase/supabase.module';
import { KsefStatusService } from '../../ksef/ksef-status.service';
import { DlqService } from '../dlq.service';

export interface CheckStatusUpoJobData {
  documentId: string;
  sessionRefNr: string;
  accessToken: string;
  companyId: string;
}

@Processor('check-status-upo')
export class CheckStatusUpoProcessor {
  private readonly logger = new Logger(CheckStatusUpoProcessor.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly ksefStatus: KsefStatusService,
    private readonly dlq: DlqService,
    @InjectQueue('generate-pdf') private readonly pdfQueue: Queue,
  ) {}

  @Process()
  async handle(job: Job<CheckStatusUpoJobData>): Promise<void> {
    const { documentId, sessionRefNr, accessToken, companyId } = job.data;
    this.logger.log(`Checking UPO for document ${documentId}, session ${sessionRefNr}`);

    try {
      // 1. Poll until session is complete
      const sessionResult = await this.ksefStatus.pollUntilComplete(
        sessionRefNr,
        accessToken,
      );

      this.logger.log(
        `Session ${sessionRefNr} complete: ${sessionResult.successfulInvoiceCount}/${sessionResult.invoiceCount} invoices`,
      );

      // 2. Get invoice results (ksefNumber)
      const invoiceResults = await this.ksefStatus.getInvoiceResults(
        sessionRefNr,
        accessToken,
      );

      if (invoiceResults.length > 0) {
        const inv = invoiceResults[0];
        // 3. Update document with KSeF number
        const { error: updateErr } = await this.supabase
          .from('documents')
          .update({
            ksef_status: KsefStatus.ACCEPTED,
            ksef_reference_number: inv.ksefNumber,
            upo_number: sessionResult.upoPages?.[0]?.referenceNumber ?? null,
          })
          .eq('id', documentId);

        if (updateErr) {
          this.logger.error(`Failed to update doc ${documentId}: ${updateErr.message}`);
        }

        this.logger.log(
          `Document ${documentId} ACCEPTED — KSeF: ${inv.ksefNumber}`,
        );

        // 4. Enqueue PDF generation
        await this.pdfQueue.add(
          { documentId },
          { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
        );
      } else {
        // No invoices found — session had failures
        await this.updateStatus(documentId, KsefStatus.REJECTED);
        this.logger.warn(
          `Document ${documentId} REJECTED — no successful invoices in session`,
        );
      }
    } catch (err) {
      const error = err as Error;
      const isTimeout = error.message.includes('timed out');
      this.logger.error(`check-status-upo failed for ${documentId}: ${error.message}`);

      await this.updateStatus(
        documentId,
        isTimeout ? KsefStatus.PROCESSING_TIMEOUT : KsefStatus.SEND_FAILED,
      );
      await this.dlq.record({
        document_id: documentId,
        queue_name: 'check-status-upo',
        job_id: String(job.id),
        step: 'check-status-upo',
        error_message: error.message,
        error_stack: error.stack,
        payload: { sessionRefNr, companyId },
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
