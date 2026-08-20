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
