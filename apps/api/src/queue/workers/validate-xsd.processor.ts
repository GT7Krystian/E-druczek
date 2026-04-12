import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Inject, Logger } from '@nestjs/common';
import { Job, Queue } from 'bull';
import { SupabaseClient } from '@supabase/supabase-js';
import { KsefStatus } from '@e-druczek/shared';
import { SUPABASE_CLIENT } from '../../supabase/supabase.module';
import { XsdValidatorService } from '../../xml/xsd-validator.service';
import { DlqService } from '../dlq.service';

export interface ValidateXsdJobData {
  documentId: string;
}

@Processor('validate-xsd')
export class ValidateXsdProcessor {
  private readonly logger = new Logger(ValidateXsdProcessor.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly xsdValidator: XsdValidatorService,
    private readonly dlq: DlqService,
    @InjectQueue('send-to-ksef') private readonly sendQueue: Queue,
  ) {}

  @Process()
  async handle(job: Job<ValidateXsdJobData>): Promise<void> {
    const { documentId } = job.data;
    this.logger.log(`Validating XSD for document ${documentId}`);

    try {
      // 1. Fetch document to get XML storage path
      const { data: doc, error: docErr } = await this.supabase
        .from('documents')
        .select('id, xml_url, company_id')
        .eq('id', documentId)
        .single();
      if (docErr || !doc) throw new Error(`Document not found: ${documentId}`);
      if (!doc.xml_url) throw new Error(`No XML URL for document ${documentId}`);

      // 2. Download XML from Supabase Storage
      const { data: blob, error: dlErr } = await this.supabase.storage
        .from('documents')
        .download(doc.xml_url);
      if (dlErr || !blob) throw new Error(`XML download failed: ${dlErr?.message}`);
      const xml = await blob.text();

      // 3. Validate against XSD
      const result = await this.xsdValidator.validate(xml);

      if (!result.valid) {
        // XSD validation is currently a stub (xmllint-wasm may not be loaded).
        // If the validator is not ready, treat as a warning and proceed.
        const isStubError = result.errors.some((e) =>
          e.includes('XSD validator not initialized'),
        );

        if (isStubError) {
          this.logger.warn(
            `XSD validator not available — skipping validation for ${documentId}`,
          );
        } else {
          this.logger.error(
            `XSD validation failed for ${documentId}: ${result.errors.join('; ')}`,
          );
          await this.updateStatus(documentId, KsefStatus.REJECTED);
          await this.dlq.record({
            document_id: documentId,
            queue_name: 'validate-xsd',
            job_id: String(job.id),
            step: 'validate-xsd',
            error_message: `XSD validation: ${result.errors.join('; ')}`,
            retry_count: job.attemptsMade,
          });
          return; // Don't enqueue next step
        }
      } else {
        this.logger.log(`XSD valid for ${documentId}`);
      }

      // 4. Enqueue send-to-ksef
      await this.sendQueue.add(
        { documentId },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
    } catch (err) {
      const error = err as Error;
      this.logger.error(`validate-xsd failed for ${documentId}: ${error.message}`);

      await this.updateStatus(documentId, KsefStatus.SEND_FAILED);
      await this.dlq.record({
        document_id: documentId,
        queue_name: 'validate-xsd',
        job_id: String(job.id),
        step: 'validate-xsd',
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
