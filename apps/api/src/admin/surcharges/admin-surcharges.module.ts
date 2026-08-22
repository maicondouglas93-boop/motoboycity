import { Module } from '@nestjs/common';
import { AdminSurchargesController } from './admin-surcharges.controller';
import { AdminSurchargesService } from './admin-surcharges.service';

@Module({
  controllers: [AdminSurchargesController],
  providers: [AdminSurchargesService],
})
export class AdminSurchargesModule {}
