import { Module } from '@nestjs/common';
import { AdminServiceTypesController } from './admin-service-types.controller';
import { AdminServiceTypesService } from './admin-service-types.service';

@Module({
  controllers: [AdminServiceTypesController],
  providers: [AdminServiceTypesService],
  exports: [AdminServiceTypesService],
})
export class AdminServiceTypesModule {}
