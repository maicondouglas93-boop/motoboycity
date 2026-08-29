import { Module } from '@nestjs/common';
import { AdminPlatformSettingsModule } from '../admin/platform-settings/admin-platform-settings.module';
import { FinanceModule } from '../finance/finance.module';
import { AdminNotificationsService } from './admin-notifications.service';
import { CompanyNotificationsService } from './company-notifications.service';
import {
  AdminNotificationsController,
  CompanyNotificationsController,
} from './notifications.controller';

/**
 * Central de avisos derivada do estado atual — sem tabela, sem escrita a cada
 * evento e sem estado de lido. Ver `packages/types/src/notifications.ts` para o
 * porquê dessa escolha e para o que ela custa.
 */
@Module({
  imports: [AdminPlatformSettingsModule, FinanceModule],
  controllers: [CompanyNotificationsController, AdminNotificationsController],
  providers: [CompanyNotificationsService, AdminNotificationsService],
})
export class NotificationsModule {}
