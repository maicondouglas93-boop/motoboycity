import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { NotificationsResult } from '@motoboycity/types';
import { jobCheckInSchema, type JobCheckInPayload } from '@motoboycity/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { BACKUP_JOB, JobCheckInService } from './job-check-in.service';
import { JobTokenGuard } from './job-token.guard';
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

/**
 * Aviso de vida das rotinas externas.
 *
 * Fora do `JwtAuthGuard` de proposito: quem chama e um runner do GitHub, que
 * nao tem sessao de usuario. A autorizacao e um segredo compartilhado no
 * cabecalho, comparado em tempo constante.
 */
@Controller('ops/check-in')
@UseGuards(JobTokenGuard)
export class JobCheckInController {
  constructor(private readonly service: JobCheckInService) {}

  @Post('backup-banco')
  @HttpCode(200)
  async backup(
    @Body(new ZodValidationPipe(jobCheckInSchema)) payload: JobCheckInPayload,
  ): Promise<{ ok: true }> {
    return this.service.registrar(BACKUP_JOB, payload.sizeBytes, payload.detail);
  }
}
