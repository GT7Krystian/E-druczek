import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { XmlModule } from '../xml/xml.module';
import { KsefModule } from '../ksef/ksef.module';
import { PdfModule } from '../pdf/pdf.module';
import { DlqService } from './dlq.service';
import { SlaMonitorService } from './sla-monitor.service';
import { GenerateXmlProcessor } from './workers/generate-xml.processor';
import { ValidateXsdProcessor } from './workers/validate-xsd.processor';
import { SendToKsefProcessor } from './workers/send-to-ksef.processor';
import { CheckStatusUpoProcessor } from './workers/check-status-upo.processor';
import { GeneratePdfProcessor } from './workers/generate-pdf.processor';

@Module({
  imports: [
    ScheduleModule.forRoot(),
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
    XmlModule,
    KsefModule,
    PdfModule,
  ],
  providers: [
    DlqService,
    SlaMonitorService,
    GenerateXmlProcessor,
    ValidateXsdProcessor,
    SendToKsefProcessor,
    CheckStatusUpoProcessor,
    GeneratePdfProcessor,
  ],
  exports: [BullModule, DlqService],
})
export class QueueModule {}
