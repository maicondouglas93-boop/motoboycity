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
import { AsaasClient } from './asaas/asaas.client';
import { AsaasBillingService } from './asaas/asaas-billing.service';
import { AsaasWebhookController, CompanyInvoicePixController } from './asaas/asaas.controller';
import { AdminPlatformSettingsModule } from '../admin/platform-settings/admin-platform-settings.module';

@Module({
  // `AdminPlatformSettingsModule` porque o dia do saque virou configuracao: o
  // servico do saque e o da carteira leem `withdrawalWeekday` de la. Sem o
  // import, o Nest nao resolve a dependencia e a API nao sobe — foi o que
  // aconteceu na primeira tentativa.
  imports: [
    BullModule.registerQueue({ name: FINANCE_QUEUE }),
    RealtimeModule,
    AdminPlatformSettingsModule,
  ],
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
    CompanyInvoicePixController,
    AsaasWebhookController,
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
    AsaasClient,
    AsaasBillingService,
  ],
  //  sai daqui para a central de avisos poder reusar a mesma
  // atualizacao de vencimento, em vez de reimplementar a regra de OVERDUE.
  exports: [FinanceLedgerService, InvoiceService],
})
export class FinanceModule {}
