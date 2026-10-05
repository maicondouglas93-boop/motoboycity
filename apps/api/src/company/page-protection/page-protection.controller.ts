import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  PageProtectionRecoveryStatus,
  PageProtectionStatusItem,
  ProtectablePageRoute,
  VerifyPagePasswordResult,
} from '@motoboycity/types';
import {
  resetPageProtectionSchema,
  setPageProtectionRecoverySchema,
  setPageProtectionSchema,
  updatePageProtectionSchema,
  verifyPagePasswordSchema,
  protectablePageRouteSchema,
  type ResetPageProtectionInput,
  type SetPageProtectionInput,
  type SetPageProtectionRecoveryInput,
  type UpdatePageProtectionInput,
  type VerifyPagePasswordInput,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { CompanyOnlyGuard } from '../../auth/company-only.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PageProtectionService } from './page-protection.service';

/** Rotas que conferem senha ou resposta: poucas tentativas, contra adivinhação. */
const PASSWORD_CHECK_THROTTLE = { default: { limit: 5, ttl: 60_000 } };
/** A resposta da pergunta secreta costuma ser curta e adivinhável: limite mais longo. */
const RESET_THROTTLE = { default: { limit: 5, ttl: 10 * 60_000 } };

@Controller('company/page-protection')
@UseGuards(JwtAuthGuard, CompanyOnlyGuard)
export class PageProtectionController {
  constructor(private readonly pageProtectionService: PageProtectionService) {}

  @Get()
  async list(@CurrentUser() user: User): Promise<PageProtectionStatusItem[]> {
    return this.pageProtectionService.list(user);
  }

  @Post()
  async setProtection(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(setPageProtectionSchema)) body: SetPageProtectionInput,
  ): Promise<PageProtectionStatusItem> {
    return this.pageProtectionService.setProtection(user, body);
  }

  // Duas partes no caminho: nao se confunde com `PUT :routeKey`, de uma parte so.
  @Get('recovery/question')
  async getRecovery(@CurrentUser() user: User): Promise<PageProtectionRecoveryStatus> {
    return this.pageProtectionService.getRecovery(user);
  }

  @Put('recovery/question')
  @Throttle(PASSWORD_CHECK_THROTTLE)
  async setRecovery(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(setPageProtectionRecoverySchema))
    body: SetPageProtectionRecoveryInput,
  ): Promise<PageProtectionRecoveryStatus> {
    return this.pageProtectionService.setRecovery(user, body);
  }

  @Post(':routeKey/reset')
  @Throttle(RESET_THROTTLE)
  async resetPassword(
    @CurrentUser() user: User,
    @Param('routeKey', new ZodValidationPipe(protectablePageRouteSchema))
    routeKey: ProtectablePageRoute,
    @Body(new ZodValidationPipe(resetPageProtectionSchema)) body: ResetPageProtectionInput,
  ): Promise<PageProtectionStatusItem> {
    return this.pageProtectionService.resetPassword(user, routeKey, body);
  }

  @Put(':routeKey')
  @Throttle(PASSWORD_CHECK_THROTTLE)
  async updateProtection(
    @CurrentUser() user: User,
    @Param('routeKey', new ZodValidationPipe(protectablePageRouteSchema))
    routeKey: ProtectablePageRoute,
    @Body(new ZodValidationPipe(updatePageProtectionSchema)) body: UpdatePageProtectionInput,
  ): Promise<PageProtectionStatusItem> {
    return this.pageProtectionService.updateProtection(user, routeKey, body);
  }

  /**
   * Endpoint de verificacao de senha com rate limiting dedicado
   * para mitigar qualquer tentativa de brute-force automatizada.
   */
  @Post('verify')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async verify(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(verifyPagePasswordSchema)) body: VerifyPagePasswordInput,
  ): Promise<VerifyPagePasswordResult> {
    return this.pageProtectionService.verifyPassword(user, body);
  }
}
