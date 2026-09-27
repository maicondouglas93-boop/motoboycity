import { InternalServerErrorException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AdminPlatformSettingsService } from '../admin/platform-settings/admin-platform-settings.service';
import { FinancialClock } from './financial-clock.service';
import { nextRepasseReleaseAt } from './finance-release.utils';

interface CompletedDeliveryCredit {
  id: string;
  driverId: string | null;
  driverValue: Prisma.Decimal | number | null;
}

/**
 * Lançamentos financeiros que nascem de eventos operacionais.
 *
 * A carteira não é saldo mutável: o crédito do repasse é uma linha de ledger
 * criada na mesma transação que fecha a entrega. Enquanto estiver PENDING,
 * compõe o saldo bloqueado — portanto aparece para o motoboy e para o admin,
 * mas ainda não pode ser sacado.
 *
 * Motoboy de salário fixo (`SALARIED`) não tem repasse: a parte dele passa
 * para a plataforma na própria entrega, e a carteira não muda.
 */
@Injectable()
export class FinanceLedgerService {
  constructor(
    private readonly platformSettings: AdminPlatformSettingsService,
    private readonly clock: FinancialClock,
  ) {}

  async creditDriverRepasse(
    tx: Prisma.TransactionClient,
    delivery: CompletedDeliveryCredit,
  ): Promise<void> {
    if (!delivery.driverId || delivery.driverValue === null) {
      throw new InternalServerErrorException(
        'Não foi possível gerar o repasse: a entrega concluída não tem entregador ou valor definido.',
      );
    }

    const driver = await tx.driver.findUnique({
      where: { id: delivery.driverId },
      select: { compensation: true },
    });
    if (driver?.compensation === 'SALARIED') {
      /*
       * A entrega fica inteira com a plataforma: a parte do motoboy soma na da
       * plataforma e zera. Lida do banco, e não do valor que chegou: concluir de
       * novo soma zero, porque a primeira vez já zerou a parte do motoboy. A
       * empresa paga o mesmo `totalValue` de sempre.
       */
      await tx.$executeRaw`
        UPDATE "deliveries"
        SET "platformValue" = COALESCE("platformValue", 0) + COALESCE("driverValue", 0),
            "driverValue" = 0
        WHERE "id" = ${delivery.id}
      `;
      return;
    }

    const { withdrawalWeekday } = await this.platformSettings.get();
    const completedAt = this.clock.now();
    const wallet = await tx.wallet.upsert({
      where: { driverId: delivery.driverId },
      update: {},
      create: { driverId: delivery.driverId },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'CREDIT_REPASSE',
        status: 'PENDING',
        amount: delivery.driverValue,
        relatedDeliveryId: delivery.id,
        idempotencyKey: `driver-repasse:${delivery.id}`,
        releaseAt: nextRepasseReleaseAt(completedAt, withdrawalWeekday),
      },
    });

    await tx.wallet.update({
      where: { id: wallet.id },
      data: { cachedBlockedBalance: { increment: delivery.driverValue } },
    });
  }
}
