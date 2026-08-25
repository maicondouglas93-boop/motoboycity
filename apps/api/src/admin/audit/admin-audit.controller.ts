import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { AdministrativeAuditEvent } from '@motoboycity/types';
import {
  administrativeAuditQuerySchema,
  type AdministrativeAuditQuery,
} from '@motoboycity/validation';
import { AdminOnlyGuard } from '../../auth/admin-only.guard';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminAuditService } from './admin-audit.service';

@Controller('admin/audit')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminAuditController {
  constructor(private readonly service: AdminAuditService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(administrativeAuditQuerySchema)) query: AdministrativeAuditQuery,
  ): Promise<AdministrativeAuditEvent[]> {
    return this.service.list(query);
  }
}
