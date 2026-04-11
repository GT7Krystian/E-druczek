import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { KsefPipelineProcessor } from './ksef-pipeline.processor';

@Module({
  imports: [
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
    BullModule.registerQueue(
      { name: 'generate-xml' },
      { name: 'validate-xsd' },
      { name: 'send-to-ksef' },
      { name: 'check-status-upo' },
      { name: 'generate-pdf' },
      { name: 'invoice-offline-sync' },
    ),
  ],
  providers: [KsefPipelineProcessor],
  exports: [BullModule],
})
export class QueueModule {}
