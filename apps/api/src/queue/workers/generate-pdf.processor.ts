import { Processor, Process } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { SupabaseClient } from '@supabase/supabase-js';
import { PdfStatus } from '@e-druczek/shared';
import { SUPABASE_CLIENT } from '../../supabase/supabase.module';
import { PdfGeneratorService } from '../../pdf/pdf-generator.service';
import { DlqService } from '../dlq.service';

export interface GeneratePdfJobData {
  documentId: string;
}

/**
 * PDF generation worker.
 * Downloads XML from Supabase Storage, renders PDF with PDFKit + QR codes,
 * uploads PDF back to storage, updates document.pdf_url + pdf_status.
 * Non-blocking — document is already ACCEPTED before PDF is generated.
 */
@Processor('generate-pdf')
export class GeneratePdfProcessor {
  private readonly logger = new Logger(GeneratePdfProcessor.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly pdfGenerator: PdfGeneratorService,
    private readonly dlq: DlqService,
  ) {}

  @Process()
  async handle(job: Job<GeneratePdfJobData>): Promise<void> {
    const { documentId } = job.data;
    this.logger.log(`Generating PDF for document ${documentId}`);

    // Mark as retrying
    await this.supabase
      .from('documents')
      .update({ pdf_status: PdfStatus.RETRYING })
      .eq('id', documentId);

    try {
      // Fetch document to get XML storage path
      const { data: doc, error: docErr } = await this.supabase
        .from('documents')
        .select('id, xml_url')
        .eq('id', documentId)
        .single();
      if (docErr || !doc) throw new Error(`Document not found: ${documentId}`);
      if (!doc.xml_url) throw new Error(`No XML URL for document ${documentId}`);

      // Generate PDF from XML
      const { pdfStoragePath } = await this.pdfGenerator.generateFromStorage(
        documentId,
        doc.xml_url,
      );

      // Update document with PDF path and status
      const { error: updateErr } = await this.supabase
        .from('documents')
        .update({
          pdf_status: PdfStatus.GENERATED,
          pdf_url: pdfStoragePath,
          pdf_generated_from_xml: true,
        })
        .eq('id', documentId);
      if (updateErr) throw new Error(`Document update failed: ${updateErr.message}`);

      this.logger.log(`PDF generated for ${documentId}: ${pdfStoragePath}`);
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
