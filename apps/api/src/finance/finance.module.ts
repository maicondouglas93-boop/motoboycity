import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AdminFinancialController } from './admin-financial.controller';
import { AdminFinancialService } from './admin-financial.service';
import { DriverWalletController } from './driver-wallet.controller';
import { DriverWalletService } from './driver-wallet.service';
import { FinanceLedgerService } from './finance-ledger.service';
import { AdminInvoicesController, CompanyInvoicesController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { FinancialClock } from './financial-clock.service';
import { FinancialPayoutProcessor, FINANCE_QUEUE } from './financial-payout.processor';
import { FinancialPayoutService } from './financial-payout.service';
import { FinancialReleaseScheduler } from './financial-release.scheduler';
import { AdminWithdrawalController, DriverWithdrawalController } from './withdrawal.controller';

@Module({
  imports: [BullModule.registerQueue({ name: FINANCE_QUEUE })],
  controllers: [
    DriverWalletController,
    AdminFinancialController,
    AdminInvoicesController,
    CompanyInvoicesController,
    DriverWithdrawalController,
    AdminWithdrawalController,
  ],
  providers: [
    AdminFinancialService,
    DriverWalletService,
    FinanceLedgerService,
    InvoiceService,
    FinancialClock,
    FinancialPayoutService,
    FinancialPayoutProcessor,
    FinancialReleaseScheduler,
  ],
  exports: [FinanceLedgerService],
})
export class FinanceModule {}
