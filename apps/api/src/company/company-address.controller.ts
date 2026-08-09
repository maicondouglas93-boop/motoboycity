import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import {
  upsertCompanyAddressSchema,
  type UpsertCompanyAddressPayload,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { CompanyOnlyGuard } from '../auth/company-only.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CompanyAddressService, type CompanyAddressItem } from './company-address.service';

@Controller('company/address')
@UseGuards(JwtAuthGuard, CompanyOnlyGuard)
export class CompanyAddressController {
  constructor(private readonly companyAddressService: CompanyAddressService) {}

  @Get()
  async get(@CurrentUser() user: User): Promise<{ address: CompanyAddressItem | null }> {
    return { address: await this.companyAddressService.get(user) };
  }

  @Put()
  async upsert(
    @Body(new ZodValidationPipe(upsertCompanyAddressSchema)) body: UpsertCompanyAddressPayload,
    @CurrentUser() user: User,
  ): Promise<{ address: CompanyAddressItem }> {
    return { address: await this.companyAddressService.upsert(user, body) };
  }
}
