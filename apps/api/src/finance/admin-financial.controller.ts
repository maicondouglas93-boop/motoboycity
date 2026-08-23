import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  adminFinancialOverviewQuerySchema,
  listAdminWalletsQuerySchema,
  listWalletTransactionsQuerySchema,
  type AdminFinancialOverviewQuery,
  type ListAdminWalletsQuery,
  type ListWalletTransactionsQuery,
} from '@motoboycity/validation';
import { AdminOnlyGuard } from '../auth/admin-only.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { CashPositionItem } from '@motoboycity/types';
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
}
