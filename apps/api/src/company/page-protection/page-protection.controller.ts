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
  PageProtectionStatusItem,
  ProtectablePageRoute,
  VerifyPagePasswordResult,
} from '@motoboycity/types';
import {
  setPageProtectionSchema,
  updatePageProtectionSchema,
  verifyPagePasswordSchema,
  protectablePageRouteSchema,
  type SetPageProtectionInput,
  type UpdatePageProtectionInput,
  type VerifyPagePasswordInput,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { CompanyOnlyGuard } from '../../auth/company-only.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PageProtectionService } from './page-protection.service';

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

  @Put(':routeKey')
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
