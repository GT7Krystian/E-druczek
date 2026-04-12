import { Processor, Process } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { SupabaseClient } from '@supabase/supabase-js';
import { PdfStatus } from '@e-druczek/shared';
import { SUPABASE_CLIENT } from '../../supabase/supabase.module';
import { DlqService } from '../dlq.service';

export interface GeneratePdfJobData {
  documentId: string;
}

/**
 * PDF generation worker — stub for ETAP 7.
 * Currently marks pdf_status as PENDING. Full implementation in E7.
 * Does NOT block the ACCEPTED status — PDF is a non-critical follow-up.
 */
@Processor('generate-pdf')
export class GeneratePdfProcessor {
  private readonly logger = new Logger(GeneratePdfProcessor.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly dlq: DlqService,
  ) {}

  @Process()
  async handle(job: Job<GeneratePdfJobData>): Promise<void> {
    const { documentId } = job.data;
    this.logger.log(`PDF generation requested for ${documentId} (stub — E7)`);

    try {
      // TODO (E7): Implement actual PDF generation from XML in storage
      // - Download XML from Supabase Storage
      // - Render PDF (XSLT or custom renderer)
      // - Add QR codes (2x for Offline24)
      // - Upload PDF to Supabase Storage
      // - Update document.pdf_url and pdf_status

      await this.supabase
        .from('documents')
        .update({ pdf_status: PdfStatus.PENDING })
        .eq('id', documentId);

      this.logger.log(`PDF stub complete for ${documentId}`);
    } catch (err) {
      const error = err as Error;
      this.logger.error(`generate-pdf failed for ${documentId}: ${error.message}`);

      await this.supabase
        .from('documents')
        .update({ pdf_status: PdfStatus.FAILED })
        .eq('id', documentId);

      await this.dlq.record({
        document_id: documentId,
        queue_name: 'generate-pdf',
        job_id: String(job.id),
        step: 'generate-pdf',
        error_message: error.message,
        error_stack: error.stack,
        retry_count: job.attemptsMade,
      });
      throw err;
    }
  }
}
