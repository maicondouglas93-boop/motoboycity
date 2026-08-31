import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  CLOSE_COMPANY_INVOICES_JOB,
  FINANCE_QUEUE,
  RELEASE_DRIVER_REPASSES_JOB,
} from './financial-payout.processor';
import { FinancialPayoutService } from './financial-payout.service';
import { InvoiceService } from './invoice.service';

/** Agenda repasses semanais e processa as politicas de faturamento diariamente. */
@Injectable()
export class FinancialReleaseScheduler implements OnModuleInit {
  private readonly logger = new Logger(FinancialReleaseScheduler.name);

  constructor(
    @InjectQueue(FINANCE_QUEUE) private readonly financeQueue: Queue,
    private readonly financialPayoutService: FinancialPayoutService,
    private readonly invoiceService: InvoiceService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.financeQueue.upsertJobScheduler(
      'weekly-driver-repasse-release',
      { pattern: '0 0 * * 1', tz: 'America/Sao_Paulo' },
      { name: RELEASE_DRIVER_REPASSES_JOB, data: {} },
    );
    await this.financeQueue.removeJobScheduler('weekly-company-invoice-close');
    await this.financeQueue.upsertJobScheduler(
      'daily-company-billing',
      { pattern: '5 0 * * *', tz: 'America/Sao_Paulo' },
      { name: CLOSE_COMPANY_INVOICES_JOB, data: {} },
    );
    await this.recuperarAtrasados();
  }

  /**
   * A recuperação do que ficou atrasado NÃO pode derrubar a subida da API.
   *
   * Isto aqui é rede de segurança: o trabalho de verdade acontece nos jobs
   * agendados logo acima, e o processador do BullMQ chama exatamente os mesmos
   * métodos. Enquanto essas chamadas ficaram sem proteção, uma falha delas
   * estourava dentro do `onModuleInit`, o Nest abortava o bootstrap e o
   * processo saía com código 1 — a API inteira não subia por causa da rede de
   * segurança dela.
   *
   * Foi o que aconteceu no deploy de 31/08/2026: `P2028` (transação expirada)
   * em `releaseDueRepasses`, e o Render registrou "No open ports detected".
   * A produção só não caiu porque o Render mantém a versão anterior quando a
   * nova não abre porta.
   *
   * Falhar aqui é aceitável e o job agendado tenta de novo. Não subir não é.
   */
  private async recuperarAtrasados(): Promise<void> {
    try {
      const released = await this.financialPayoutService.releaseDueRepasses();
      if (released > 0) {
        this.logger.log(`${released} repasse(s) atrasado(s) liberado(s) na inicialização.`);
      }
    } catch (error) {
      this.logger.error(
        'Não foi possível liberar repasses atrasados na inicialização. O job semanal tentará de novo.',
        error instanceof Error ? error.stack : String(error),
      );
    }

    try {
      const billing = await this.invoiceService.processScheduledBilling();
      if (billing.invoices.length > 0) {
        this.logger.log(`${billing.invoices.length} fatura(s) fechada(s) na inicialização.`);
      }
      if (billing.blockedCompanyIds.length > 0) {
        this.logger.warn(
          `${billing.blockedCompanyIds.length} empresa(s) bloqueada(s) por inadimplencia na inicialização.`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Não foi possível processar o faturamento na inicialização. O job diário tentará de novo.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
