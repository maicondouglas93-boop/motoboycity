import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import type { StoreSettings } from '@motoboycity/types';
import { updateStoreLinkSchema, type UpdateStoreLinkPayload } from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { CompanyOnlyGuard } from '../../auth/company-only.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { StoreSettingsService } from './store-settings.service';

/** O link e o nome da loja online, no painel da empresa. */
@Controller('company/store/settings')
@UseGuards(JwtAuthGuard, CompanyOnlyGuard)
export class StoreSettingsController {
  constructor(private readonly storeSettingsService: StoreSettingsService) {}

  @Get()
  settings(@CurrentUser() user: User): Promise<StoreSettings> {
    return this.storeSettingsService.settings(user);
  }

  @Put('link')
  updateLink(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(updateStoreLinkSchema)) body: UpdateStoreLinkPayload,
  ): Promise<StoreSettings> {
    return this.storeSettingsService.updateLink(user, body);
  }
}
