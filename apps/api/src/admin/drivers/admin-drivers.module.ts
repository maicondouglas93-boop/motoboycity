import { Module } from '@nestjs/common';
import { AdminDriversController } from './admin-drivers.controller';
import { AdminDriversService } from './admin-drivers.service';

@Module({
  controllers: [AdminDriversController],
  providers: [AdminDriversService],
})
export class AdminDriversModule {}
