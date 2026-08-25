import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { DispatchModule } from '../../dispatch/dispatch.module';
import { LivePresenceModule } from '../../live-presence/live-presence.module';
import { RealtimeModule } from '../../realtime/realtime.module';
import { AdminDriversController } from './admin-drivers.controller';
import { AdminDriversService } from './admin-drivers.service';
import { ImageKitModule } from '../../media/imagekit.module';

// Bloquear/suspender precisa soltar as ofertas pendentes do motoboy (DispatchModule) e
// avisar o aplicativo dele (RealtimeModule) — ver P1-03 no handoff.
@Module({
  imports: [AuthModule, DispatchModule, LivePresenceModule, RealtimeModule, ImageKitModule],
  controllers: [AdminDriversController],
  providers: [AdminDriversService],
  exports: [AdminDriversService],
})
export class AdminDriversModule {}
