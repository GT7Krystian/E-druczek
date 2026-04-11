import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';

@Processor('generate-xml')
export class KsefPipelineProcessor {
  @Process()
  async handleGenerateXml(job: Job) {
    // TODO: generate FA(3) XML from document snapshot (Data Freeze)
    console.log('generate-xml job:', job.id, job.data);
  }
}
