import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FINANCE_QUEUE } from '../../finance/financial-payout.constants';
import { AdminPlatformSettingsController } from './admin-platform-settings.controller';
import { AdminPlatformSettingsService } from './admin-platform-settings.service';

@Module({
  imports: [BullModule.registerQueue({ name: FINANCE_QUEUE })],
  controllers: [AdminPlatformSettingsController],
  providers: [AdminPlatformSettingsService],
  exports: [AdminPlatformSettingsService],
})
export class AdminPlatformSettingsModule {}
