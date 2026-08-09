import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  updatePlatformSettingsSchema,
  type UpdatePlatformSettingsPayload,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { AdminOnlyGuard } from '../../auth/admin-only.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  AdminPlatformSettingsService,
  type PlatformSettingsItem,
} from './admin-platform-settings.service';

@Controller('admin/platform-settings')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminPlatformSettingsController {
  constructor(private readonly adminPlatformSettingsService: AdminPlatformSettingsService) {}

  @Get()
  get(): Promise<PlatformSettingsItem> {
    return this.adminPlatformSettingsService.get();
  }

  @Patch()
  update(
    @Body(new ZodValidationPipe(updatePlatformSettingsSchema)) body: UpdatePlatformSettingsPayload,
    @CurrentUser() admin: User,
  ): Promise<PlatformSettingsItem> {
    return this.adminPlatformSettingsService.update(body, admin.id);
  }
}
