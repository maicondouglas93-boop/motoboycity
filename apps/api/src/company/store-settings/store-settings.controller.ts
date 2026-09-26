import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { StoreSettings } from '@motoboycity/types';
import {
  updateStoreIdentitySchema,
  updateStoreLinkSchema,
  type UpdateStoreIdentityPayload,
  type UpdateStoreLinkPayload,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { CompanyOnlyGuard } from '../../auth/company-only.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { UploadedImageFile } from '../../media/supported-image';
import { StoreSettingsService } from './store-settings.service';

const TAMANHO_MAXIMO_DA_LOGO = 5 * 1024 * 1024;
const ENVIO_DE_LOGO_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

/** O link, o nome e a identidade visual da loja online, no painel da empresa. */
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

  @Put('identity')
  updateIdentity(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(updateStoreIdentitySchema)) body: UpdateStoreIdentityPayload,
  ): Promise<StoreSettings> {
    return this.storeSettingsService.updateIdentity(user, body);
  }

  /** A logo vai por arquivo (campo `file`), e o servidor a guarda no ImageKit. */
  @Put('logo')
  @Throttle(ENVIO_DE_LOGO_THROTTLE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { files: 1, fileSize: TAMANHO_MAXIMO_DA_LOGO } }),
  )
  setLogo(
    @CurrentUser() user: User,
    @UploadedFile() file?: UploadedImageFile,
  ): Promise<StoreSettings> {
    if (!file) throw new BadRequestException('Selecione a imagem da logo.');
    return this.storeSettingsService.setLogo(user, file);
  }

  @Delete('logo')
  removeLogo(@CurrentUser() user: User): Promise<StoreSettings> {
    return this.storeSettingsService.removeLogo(user);
  }
}
