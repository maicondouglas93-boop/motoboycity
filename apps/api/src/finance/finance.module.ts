import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AdminFinancialController } from './admin-financial.controller';
import { AdminFinancialService } from './admin-financial.service';
import { DriverWalletController } from './driver-wallet.controller';
import { DriverWalletService } from './driver-wallet.service';
import { FinanceLedgerService } from './finance-ledger.service';
import { CompanyFinancialController } from './company-financial.controller';
import {
  AdminPaymentNoticeController,
  CompanyPaymentNoticeController,
} from './payment-notice.controller';
import { PaymentNoticeService } from './payment-notice.service';
import { CompanyFinancialService } from './company-financial.service';
import { AdminInvoicesController, CompanyInvoicesController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { FinancialClock } from './financial-clock.service';
import { FinancialPayoutProcessor, FINANCE_QUEUE } from './financial-payout.processor';
import { FinancialPayoutService } from './financial-payout.service';
import { FinancialReleaseScheduler } from './financial-release.scheduler';
import { AdminWithdrawalController, DriverWithdrawalController } from './withdrawal.controller';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [BullModule.registerQueue({ name: FINANCE_QUEUE }), RealtimeModule],
  controllers: [
    DriverWalletController,
    AdminFinancialController,
    AdminInvoicesController,
    CompanyInvoicesController,
    CompanyFinancialController,
    CompanyPaymentNoticeController,
    AdminPaymentNoticeController,
    DriverWithdrawalController,
    AdminWithdrawalController,
  ],
  providers: [
    AdminFinancialService,
    DriverWalletService,
    FinanceLedgerService,
    InvoiceService,
    CompanyFinancialService,
    PaymentNoticeService,
    FinancialClock,
    FinancialPayoutService,
    FinancialPayoutProcessor,
    FinancialReleaseScheduler,
  ],
  exports: [FinanceLedgerService],
})
export class FinanceModule {}
