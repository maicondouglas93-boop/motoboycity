import { Module } from '@nestjs/common';
import { DriverScheduleController } from './driver-schedule.controller';
import { DriverScheduleService } from './driver-schedule.service';

/**
 * Sem dependencia de despacho, presenca ou fila: e o despacho e a presenca que
 * perguntam a escala, nunca o contrario — assim nao ha ciclo entre os modulos.
 */
@Module({
  controllers: [DriverScheduleController],
  providers: [DriverScheduleService],
  exports: [DriverScheduleService],
})
export class DriverScheduleModule {}
