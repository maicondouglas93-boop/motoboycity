import { Controller, Get, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { NotificationsResult } from '@motoboycity/types';
import { AdminOnlyGuard } from '../auth/admin-only.guard';
import { CompanyOnlyGuard } from '../auth/company-only.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminNotificationsService } from './admin-notifications.service';
import { CompanyNotificationsService } from './company-notifications.service';

/**
 * Sem parametro de empresa, de proposito: ela vem do token. Aceitar `companyId`
 * na query deixaria uma loja ler os avisos de outra.
 */
@Controller('company/notifications')
@UseGuards(JwtAuthGuard, CompanyOnlyGuard)
export class CompanyNotificationsController {
  constructor(private readonly service: CompanyNotificationsService) {}

  @Get()
  list(@CurrentUser() user: User): Promise<NotificationsResult> {
    return this.service.list(user);
  }
}

@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminNotificationsController {
  constructor(private readonly service: AdminNotificationsService) {}

  @Get()
  list(): Promise<NotificationsResult> {
    return this.service.list();
  }
}
