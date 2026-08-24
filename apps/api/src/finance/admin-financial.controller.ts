import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  adjustDriverWalletSchema,
  adminFinancialOverviewQuerySchema,
  financialStatementQuerySchema,
  financialCycleQuerySchema,
  cashFlowForecastQuerySchema,
  listAdminWalletsQuerySchema,
  listReceiptsQuerySchema,
  listWalletTransactionsQuerySchema,
  type AdjustDriverWalletPayload,
  type AdminFinancialOverviewQuery,
  type FinancialStatementQuery,
  type FinancialCycleQuery,
  type CashFlowForecastQuery,
  type ListAdminWalletsQuery,
  type ListReceiptsQuery,
  type ListWalletTransactionsQuery,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { AdminOnlyGuard } from '../auth/admin-only.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type {
  CashPositionItem,
  CashFlowForecastReport,
  FinancialCycleReport,
  FinancialStatementReport,
  PayoutsAgingReport,
  ReceivablesAgingReport,
  ReceiptsReport,
} from '@motoboycity/types';
import {
  AdminFinancialService,
  type AdminDriverWalletDetail,
  type AdminDriverWalletItem,
  type AdminFinancialOverview,
} from './admin-financial.service';

@Controller('admin/financial')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminFinancialController {
  constructor(private readonly adminFinancialService: AdminFinancialService) {}

  /**
   * Posicao de caixa do instante — nao aceita filtro de periodo de proposito.
   *
   * Trabalho concluido em junho e nunca faturado continua sendo dinheiro a
   * receber em agosto, e sumiria de qualquer recorte de datas.
   */
  @Get('cash-position')
  cashPosition(): Promise<CashPositionItem> {
    return this.adminFinancialService.cashPosition();
  }

  /** Fotografia atual das contas a receber, separada por idade da dívida. */
  @Get('receivables-aging')
  receivablesAging(): Promise<ReceivablesAgingReport> {
    return this.adminFinancialService.receivablesAging();
  }

  /** Obrigações atuais, saques abertos e idade por entregador. */
  @Get('payouts-aging')
  payoutsAging(): Promise<PayoutsAgingReport> {
    return this.adminFinancialService.payoutsAging();
  }

  /** Resultado por competência, dimensões gerenciais e ajustes separados. */
  @Get('financial-statement')
  financialStatement(
    @Query(new ZodValidationPipe(financialStatementQuerySchema)) query: FinancialStatementQuery,
  ): Promise<FinancialStatementReport> {
    return this.adminFinancialService.financialStatement(query);
  }

  /** Ciclo detalhado por entrega: competência, cobrança, caixa e repasse. */
  @Get('financial-cycle')
  financialCycle(
    @Query(new ZodValidationPipe(financialCycleQuerySchema)) query: FinancialCycleQuery,
  ): Promise<FinancialCycleReport> {
    return this.adminFinancialService.financialCycle(query);
  }

  /** Agenda conhecida de caixa, sem transformar liberacao em pagamento. */
  @Get('cash-flow-forecast')
  cashFlowForecast(
    @Query(new ZodValidationPipe(cashFlowForecastQuerySchema)) query: CashFlowForecastQuery,
  ): Promise<CashFlowForecastReport> {
    return this.adminFinancialService.cashFlowForecast(query);
  }

  /**
   * Extrato de recebimentos, agrupado por dia no servidor.
   *
   * O periodo e obrigatorio: sem recorte isto devolveria a operacao inteira
   * desde o primeiro dia, cresce sem limite e nunca e o que alguem quer ver.
   */
  @Get('receipts')
  receipts(
    @Query(new ZodValidationPipe(listReceiptsQuerySchema)) query: ListReceiptsQuery,
  ): Promise<ReceiptsReport> {
    return this.adminFinancialService.receipts(query);
  }

  @Get('overview')
  overview(
    @Query(new ZodValidationPipe(adminFinancialOverviewQuerySchema))
    query: AdminFinancialOverviewQuery,
  ): Promise<AdminFinancialOverview> {
    return this.adminFinancialService.overview(query);
  }

  @Get('driver-wallets')
  listDriverWallets(
    @Query(new ZodValidationPipe(listAdminWalletsQuerySchema)) query: ListAdminWalletsQuery,
  ): Promise<AdminDriverWalletItem[]> {
    return this.adminFinancialService.listDriverWallets(query);
  }

  @Get('driver-wallets/:driverId')
  getDriverWallet(
    @Param('driverId') driverId: string,
    @Query(new ZodValidationPipe(listWalletTransactionsQuerySchema))
    query: ListWalletTransactionsQuery,
  ): Promise<AdminDriverWalletDetail> {
    return this.adminFinancialService.getDriverWallet(driverId, query);
  }

  /**
   * Ajuste manual na carteira, com motivo obrigatorio e autor registrado.
   *
   * `POST` e nao `PATCH`: cada ajuste e um lancamento NOVO no extrato, nao a
   * edicao de um saldo. Nada aqui apaga ou altera lancamento anterior — um
   * erro de ajuste se corrige com outro ajuste, e os dois ficam visiveis.
   */
  @Post('driver-wallets/:driverId/adjustments')
  adjustDriverWallet(
    @Param('driverId') driverId: string,
    @Body(new ZodValidationPipe(adjustDriverWalletSchema)) body: AdjustDriverWalletPayload,
    @CurrentUser() admin: User,
  ): Promise<AdminDriverWalletDetail> {
    return this.adminFinancialService.adjustDriverWallet(driverId, body, admin.id);
  }
}
