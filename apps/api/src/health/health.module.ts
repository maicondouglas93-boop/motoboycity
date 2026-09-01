import { Module } from '@nestjs/common';
import { LivePresenceModule } from '../live-presence/live-presence.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [LivePresenceModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
