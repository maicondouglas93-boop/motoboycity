import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  listWalletTransactionsQuerySchema,
  type ListWalletTransactionsQuery,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { DriverOnlyGuard } from '../auth/driver-only.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { DriverWalletService, type DriverWalletSummary } from './driver-wallet.service';

@Controller('driver/wallet')
@UseGuards(JwtAuthGuard, DriverOnlyGuard)
export class DriverWalletController {
  constructor(private readonly driverWalletService: DriverWalletService) {}

  @Get()
  get(
    @Query(new ZodValidationPipe(listWalletTransactionsQuerySchema))
    query: ListWalletTransactionsQuery,
    @CurrentUser() user: User,
  ): Promise<DriverWalletSummary> {
    return this.driverWalletService.getForDriver(user, query);
  }
}
