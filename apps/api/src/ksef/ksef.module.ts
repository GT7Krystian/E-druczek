import { Module } from '@nestjs/common';
import { KsefCryptoService } from './ksef-crypto.service';
import { KsefApiClient } from './ksef-api.client';
import { KsefSessionService } from './ksef-session.service';
import { KsefSendService } from './ksef-send.service';
import { KsefStatusService } from './ksef-status.service';

@Module({
  providers: [
    KsefCryptoService,
    KsefApiClient,
    KsefSessionService,
    KsefSendService,
    KsefStatusService,
  ],
  exports: [
    KsefSessionService,
    KsefSendService,
    KsefStatusService,
    KsefCryptoService,
  ],
})
export class KsefModule {}
