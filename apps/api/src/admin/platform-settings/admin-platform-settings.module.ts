import { Module } from '@nestjs/common';
import { AdminPlatformSettingsController } from './admin-platform-settings.controller';
import { AdminPlatformSettingsService } from './admin-platform-settings.service';

@Module({
  controllers: [AdminPlatformSettingsController],
  providers: [AdminPlatformSettingsService],
  exports: [AdminPlatformSettingsService],
})
export class AdminPlatformSettingsModule {}
