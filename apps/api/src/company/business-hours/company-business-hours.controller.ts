import { Controller, Get, UseGuards } from '@nestjs/common';
import type { CompanyBusinessHoursStatus } from '@motoboycity/types';
import type { User } from '@prisma/client';
import { CompanyOnlyGuard } from '../../auth/company-only.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CompanyBusinessHoursService } from './company-business-hours.service';

@Controller('company/business-hours')
@UseGuards(JwtAuthGuard, CompanyOnlyGuard)
export class CompanyBusinessHoursController {
  constructor(private readonly service: CompanyBusinessHoursService) {}

  @Get()
  status(@CurrentUser() user: User): Promise<CompanyBusinessHoursStatus> {
    return this.service.status(user);
  }
}
