import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { DispatchModule } from '../../dispatch/dispatch.module';
import { RealtimeModule } from '../../realtime/realtime.module';
import { AdminDriversController } from './admin-drivers.controller';
import { AdminDriversService } from './admin-drivers.service';

// Bloquear/suspender precisa soltar as ofertas pendentes do motoboy (DispatchModule) e
// avisar o aplicativo dele (RealtimeModule) — ver P1-03 no handoff.
@Module({
  imports: [AuthModule, DispatchModule, RealtimeModule],
  controllers: [AdminDriversController],
  providers: [AdminDriversService],
  exports: [AdminDriversService],
})
export class AdminDriversModule {}
