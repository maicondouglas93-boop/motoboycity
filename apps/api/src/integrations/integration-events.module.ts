import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { IntegrationOutboxRecorder } from './integration-outbox-recorder.service';

export const INTEGRATION_OUTBOUND_QUEUE = 'integration-outbound';

@Module({
  imports: [BullModule.registerQueue({ name: INTEGRATION_OUTBOUND_QUEUE })],
  providers: [IntegrationOutboxRecorder],
  exports: [IntegrationOutboxRecorder, BullModule],
})
export class IntegrationEventsModule {}
