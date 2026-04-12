import { Inject, Injectable, Logger } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';

export interface DlqEntry {
  document_id: string | null;
  queue_name: string;
  job_id: string;
  step: string;
  error_message: string;
  error_stack?: string;
  payload?: Record<string, unknown>;
  retry_count: number;
}

/**
 * Dead Letter Queue service.
 * Records failed jobs to the `failed_jobs` table for manual review.
 */
@Injectable()
export class DlqService {
  private readonly logger = new Logger(DlqService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async record(entry: DlqEntry): Promise<void> {
    const { error } = await this.supabase.from('failed_jobs').insert({
      document_id: entry.document_id,
      queue_name: entry.queue_name,
      job_id: entry.job_id,
      step: entry.step,
      error_message: entry.error_message,
      error_stack: entry.error_stack ?? null,
      payload: entry.payload ?? null,
      retry_count: entry.retry_count,
    });

    if (error) {
      this.logger.error(
        `Failed to record DLQ entry: ${error.message}`,
        JSON.stringify(entry),
      );
    } else {
      this.logger.warn(
        `DLQ: ${entry.queue_name}/${entry.step} failed for doc ${entry.document_id} — ${entry.error_message}`,
      );
    }
  }
}
