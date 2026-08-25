import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import {
  replaceBusinessHoursSchema,
  type ReplaceBusinessHoursPayload,
} from '@motoboycity/validation';
import type { BusinessHoursResult } from '@motoboycity/types';
import type { User } from '@prisma/client';
import { AdminOnlyGuard } from '../../auth/admin-only.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminBusinessHoursService } from './admin-business-hours.service';

@Controller('admin/business-hours')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminBusinessHoursController {
  constructor(private readonly adminBusinessHoursService: AdminBusinessHoursService) {}

  @Get()
  get(): Promise<BusinessHoursResult> {
    return this.adminBusinessHoursService.get();
  }

  /** PUT e não PATCH: o conjunto de faixas é substituído por inteiro. */
  @Put()
  replace(
    @Body(new ZodValidationPipe(replaceBusinessHoursSchema)) body: ReplaceBusinessHoursPayload,
    @CurrentUser() admin: User,
  ): Promise<BusinessHoursResult> {
    return this.adminBusinessHoursService.replace(body, admin.id);
  }
}
