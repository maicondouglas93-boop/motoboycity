import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CompanyProfile, OwnPasswordChangeResult } from '@motoboycity/types';
import {
  changeOwnPasswordSchema,
  type ChangeOwnPasswordPayload,
  updateCompanyProfileSchema,
  type UpdateCompanyProfilePayload,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { CompanyOnlyGuard } from '../../auth/company-only.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CompanyProfileService } from './company-profile.service';

@Controller('company/profile')
@UseGuards(JwtAuthGuard, CompanyOnlyGuard)
export class CompanyProfileController {
  constructor(private readonly companyProfileService: CompanyProfileService) {}

  @Get()
  get(@CurrentUser() user: User): Promise<CompanyProfile> {
    return this.companyProfileService.get(user);
  }

  @Put()
  update(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(updateCompanyProfileSchema)) body: UpdateCompanyProfilePayload,
  ): Promise<CompanyProfile> {
    return this.companyProfileService.update(user, body);
  }

  @Put('password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  changePassword(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(changeOwnPasswordSchema)) body: ChangeOwnPasswordPayload,
  ): Promise<OwnPasswordChangeResult> {
    return this.companyProfileService.changePassword(user, body);
  }
}
