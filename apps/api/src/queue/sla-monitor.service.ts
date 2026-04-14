import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';

/**
 * SLA monitoring CRON job.
 * Runs every minute and logs alerts for stuck or critical documents.
 * Uses SLA views created in migration 003.
 */
@Injectable()
export class SlaMonitorService {
  private readonly logger = new Logger(SlaMonitorService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async checkSla(): Promise<void> {
    await Promise.all([
      this.checkQueuedStuck(),
      this.checkProcessingStuck(),
      this.checkOfflineCritical(),
    ]);
  }

  /** Documents in QUEUED for > 5 minutes */
  private async checkQueuedStuck(): Promise<void> {
    const { data, error } = await this.supabase
      .from('sla_queued_stuck')
      .select('id, company_id, ksef_status, updated_at, stuck_duration');

    if (error) {
      this.logger.error(`SLA query failed (queued_stuck): ${error.message}`);
      return;
    }
    if (data && data.length > 0) {
      this.logger.warn(
        `ALERT QUEUED_STUCK: ${data.length} document(s) stuck in QUEUED > 5 min: ${data.map((d: any) => d.id).join(', ')}`,
      );
    }
  }

  /** Documents in PROCESSING for > 10 minutes */
  private async checkProcessingStuck(): Promise<void> {
    const { data, error } = await this.supabase
      .from('sla_processing_stuck')
      .select('id, company_id, ksef_status, updated_at, stuck_duration');

    if (error) {
      this.logger.error(`SLA query failed (processing_stuck): ${error.message}`);
      return;
    }
    if (data && data.length > 0) {
      this.logger.warn(
        `ALERT PROCESSING_STUCK: ${data.length} document(s) stuck in PROCESSING > 10 min: ${data.map((d: any) => d.id).join(', ')}`,
      );
    }
  }

  /** Offline24 deadline in < 2 hours */
  private async checkOfflineCritical(): Promise<void> {
    const { data, error } = await this.supabase
      .from('sla_offline_critical')
      .select('id, company_id, offline24_deadline');

    if (error) {
      this.logger.error(`SLA query failed (offline_critical): ${error.message}`);
      return;
    }
    if (data && data.length > 0) {
      this.logger.warn(
        `ALERT OFFLINE_CRITICAL: ${data.length} document(s) with offline deadline < 2h: ${data.map((d: any) => d.id).join(', ')}`,
      );
    }
  }
}
