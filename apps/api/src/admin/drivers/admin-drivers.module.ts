import { Module } from '@nestjs/common';
import { DispatchModule } from '../../dispatch/dispatch.module';
import { RealtimeModule } from '../../realtime/realtime.module';
import { AdminDriversController } from './admin-drivers.controller';
import { AdminDriversService } from './admin-drivers.service';

// Bloquear/suspender precisa soltar as ofertas pendentes do motoboy (DispatchModule) e
// avisar o aplicativo dele (RealtimeModule) — ver P1-03 no handoff.
@Module({
  imports: [DispatchModule, RealtimeModule],
  controllers: [AdminDriversController],
  providers: [AdminDriversService],
})
export class AdminDriversModule {}
