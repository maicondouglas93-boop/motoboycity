import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  approveWithdrawalSchema,
  listWithdrawalRequestsQuerySchema,
  markWithdrawalPaidSchema,
  rejectWithdrawalSchema,
  requestWithdrawalSchema,
  type ApproveWithdrawalPayload,
  type ListWithdrawalRequestsQuery,
  type MarkWithdrawalPaidPayload,
  type RejectWithdrawalPayload,
  type RequestWithdrawalPayload,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { AdminOnlyGuard } from '../auth/admin-only.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { DriverOnlyGuard } from '../auth/driver-only.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { FinancialPayoutService, type WithdrawalRequestItem } from './financial-payout.service';

@Controller('driver/wallet/withdrawals')
@UseGuards(JwtAuthGuard, DriverOnlyGuard)
export class DriverWithdrawalController {
  constructor(private readonly financialPayoutService: FinancialPayoutService) {}

  @Get()
  list(@CurrentUser() user: User): Promise<WithdrawalRequestItem[]> {
    return this.financialPayoutService.listForDriver(user);
  }

  @Post()
  request(
    @Body(new ZodValidationPipe(requestWithdrawalSchema)) payload: RequestWithdrawalPayload,
    @CurrentUser() user: User,
  ): Promise<WithdrawalRequestItem> {
    return this.financialPayoutService.requestWithdrawal(user, payload);
  }
}

@Controller('admin/financial/withdrawals')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminWithdrawalController {
  constructor(private readonly financialPayoutService: FinancialPayoutService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(listWithdrawalRequestsQuerySchema))
    query: ListWithdrawalRequestsQuery,
  ): Promise<WithdrawalRequestItem[]> {
    return this.financialPayoutService.listForAdmin(query);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<WithdrawalRequestItem> {
    return this.financialPayoutService.getForAdmin(id);
  }

  @Post(':id/approve')
  approve(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(approveWithdrawalSchema)) payload: ApproveWithdrawalPayload,
    @CurrentUser() admin: User,
  ): Promise<WithdrawalRequestItem> {
    return this.financialPayoutService.approve(admin, id, payload);
  }

  @Post(':id/mark-paid')
  markPaid(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(markWithdrawalPaidSchema)) payload: MarkWithdrawalPaidPayload,
    @CurrentUser() admin: User,
  ): Promise<WithdrawalRequestItem> {
    return this.financialPayoutService.markPaid(admin, id, payload);
  }

  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rejectWithdrawalSchema)) payload: RejectWithdrawalPayload,
    @CurrentUser() admin: User,
  ): Promise<WithdrawalRequestItem> {
    return this.financialPayoutService.reject(admin, id, payload);
  }
}
