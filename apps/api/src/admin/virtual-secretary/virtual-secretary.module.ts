import { Module } from '@nestjs/common';
import { AdminCompaniesModule } from '../companies/admin-companies.module';
import { AdminDriversModule } from '../drivers/admin-drivers.module';
import { AdminOperationsModule } from '../operations/admin-operations.module';
import { AdminReportsModule } from '../reports/admin-reports.module';
import { AiModule } from '../../ai/ai.module';
import { DeliveriesModule } from '../../deliveries/deliveries.module';
import { VirtualSecretaryAuditService } from './virtual-secretary-audit.service';
import { VirtualSecretaryController } from './virtual-secretary.controller';
import { VirtualSecretaryService } from './virtual-secretary.service';
import { VirtualSecretaryToolsService } from './virtual-secretary-tools.service';

@Module({
  imports: [
    AiModule,
    AdminCompaniesModule,
    AdminDriversModule,
    AdminOperationsModule,
    AdminReportsModule,
    DeliveriesModule,
  ],
  controllers: [VirtualSecretaryController],
  providers: [
    VirtualSecretaryService,
    VirtualSecretaryToolsService,
    VirtualSecretaryAuditService,
  ],
})
export class VirtualSecretaryModule {}
