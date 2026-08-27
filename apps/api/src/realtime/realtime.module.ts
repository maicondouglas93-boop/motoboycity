import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PublicTrackingTokenService } from '../common/public-tracking-token.service';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [AuthModule],
  providers: [RealtimeGateway, PublicTrackingTokenService],
  exports: [RealtimeGateway, PublicTrackingTokenService],
})
export class RealtimeModule {}
