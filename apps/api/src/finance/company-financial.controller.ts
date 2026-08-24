import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { User } from '@prisma/client';
import type {
  CompanyFinancialPosition,
  CompanyFinancialSummary,
  CompanyUnbilledDeliveries,
} from '@motoboycity/types';
import {
  companyFinancialSummaryQuerySchema,
  type CompanyFinancialSummaryQuery,
} from '@motoboycity/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CompanyOnlyGuard } from '../auth/company-only.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyFinancialService } from './company-financial.service';

@Controller('company/financial')
@UseGuards(JwtAuthGuard, CompanyOnlyGuard)
export class CompanyFinancialController {
  constructor(private readonly companyFinancialService: CompanyFinancialService) {}

  /**
   * Posicao financeira da empresa do usuario logado.
   *
   * Sem parametro de empresa, de proposito: ela vem do token. Aceitar
   * `companyId` na query deixaria uma loja ler o financeiro de outra.
   */
  @Get('position')
  position(@CurrentUser() companyUser: User): Promise<CompanyFinancialPosition> {
    return this.companyFinancialService.position(companyUser);
  }

  /** Os pedidos que entram na proxima fatura, item a item. */
  @Get('unbilled')
  unbilled(@CurrentUser() companyUser: User): Promise<CompanyUnbilledDeliveries> {
    return this.companyFinancialService.unbilledDeliveries(companyUser);
  }

  /** Gasto no periodo, comparado com o periodo anterior. */
  @Get('summary')
  summary(
    @CurrentUser() companyUser: User,
    @Query(new ZodValidationPipe(companyFinancialSummaryQuerySchema))
    query: CompanyFinancialSummaryQuery,
  ): Promise<CompanyFinancialSummary> {
    return this.companyFinancialService.summary(companyUser, query);
  }

  /**
   * Extrato do periodo em CSV, montado no servidor.
   *
   * `Content-Disposition` com nome de arquivo: sem ele o navegador salva como
   * "export" sem extensao, e o Excel se recusa a abrir.
   */
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(
    @CurrentUser() companyUser: User,
    @Query(new ZodValidationPipe(companyFinancialSummaryQuerySchema))
    query: CompanyFinancialSummaryQuery,
    @Res() response: Response,
  ): Promise<void> {
    const csv = await this.companyFinancialService.exportCsv(companyUser, query);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="pedidos-${query.from}-a-${query.to}.csv"`,
    );
    response.send(csv);
  }
}
