import { Controller, Get, HttpCode, Post, Query, Redirect, UseGuards } from '@nestjs/common';
import type {
  AiqfomeConnectResult,
  AiqfomeDisconnectResult,
  CompanyAiqfomeIntegration,
} from '@motoboycity/types';
import {
  aiqfomeOauthCallbackQuerySchema,
  type AiqfomeOauthCallbackQuery,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { CompanyOnlyGuard } from '../../auth/company-only.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AiqfomeService } from './aiqfome.service';

@Controller('company/integrations/aiqfome')
@UseGuards(JwtAuthGuard, CompanyOnlyGuard)
export class CompanyAiqfomeController {
  constructor(private readonly aiqfomeService: AiqfomeService) {}

  @Get()
  get(@CurrentUser() user: User): Promise<CompanyAiqfomeIntegration> {
    return this.aiqfomeService.getForCompany(user);
  }

  @Post('connect')
  @HttpCode(200)
  connect(@CurrentUser() user: User): Promise<AiqfomeConnectResult> {
    return this.aiqfomeService.connect(user);
  }

  @Post('disconnect')
  @HttpCode(200)
  disconnect(@CurrentUser() user: User): Promise<AiqfomeDisconnectResult> {
    return this.aiqfomeService.disconnect(user);
  }
}

@Controller('integrations/aiqfome')
export class PublicAiqfomeController {
  constructor(private readonly aiqfomeService: AiqfomeService) {}

  @Get('callback')
  @Redirect(undefined, 302)
  async callback(
    @Query(new ZodValidationPipe(aiqfomeOauthCallbackQuerySchema))
    query: AiqfomeOauthCallbackQuery,
  ): Promise<{ url: string; statusCode: 302 }> {
    return { url: await this.aiqfomeService.handleCallback(query), statusCode: 302 };
  }
}
