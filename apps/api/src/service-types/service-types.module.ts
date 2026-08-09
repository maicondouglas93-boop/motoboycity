import { Module } from '@nestjs/common';
import { AdminServiceTypesModule } from '../admin/service-types/admin-service-types.module';
import { ServiceTypesController } from './service-types.controller';

@Module({
  imports: [AdminServiceTypesModule],
  controllers: [ServiceTypesController],
})
export class ServiceTypesModule {}
