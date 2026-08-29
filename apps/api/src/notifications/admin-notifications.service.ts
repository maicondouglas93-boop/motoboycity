import { Injectable } from '@nestjs/common';
import type { NotificationItem, NotificationsResult } from '@motoboycity/types';
import { PrismaService } from '../prisma/prisma.service';
import { AdminPlatformSettingsService } from '../admin/platform-settings/admin-platform-settings.service';
import { InvoiceService } from '../finance/invoice.service';

/** Mesma régua da empresa: além disso, alguém precisa olhar. */
const MINUTOS_SEM_MOTOBOY = 15;

@Injectable()
export class AdminNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettings: AdminPlatformSettingsService,
    private readonly invoiceService: InvoiceService,
  ) {}

  async list(): Promise<NotificationsResult> {
    await this.invoiceService.refreshOverdueInvoices();

    const limiteDeEspera = new Date(Date.now() - MINUTOS_SEM_MOTOBOY * 60_000);
    const [settings, empresas, entregadores, avisos, vencidas, semMotoboy] = await Promise.all([
      this.platformSettings.get(),
      this.prisma.company.count({ where: { status: 'PENDING_APPROVAL' } }),
      this.prisma.driver.count({ where: { approvalStatus: 'PENDING' } }),
      this.prisma.invoicePaymentNotice.count({ where: { status: 'PENDING' } }),
      this.prisma.invoice.aggregate({
        where: { status: 'OVERDUE' },
        _count: { _all: true },
        _sum: { totalValue: true },
      }),
      this.prisma.delivery.count({
        where: { status: 'AWAITING_DRIVER', createdAt: { lte: limiteDeEspera } },
      }),
    ]);

    const items: NotificationItem[] = [];

    /**
     * As duas configurações que param a plataforma inteira vêm primeiro.
     *
     * Sem tempo de resposta da oferta o despacho congela; sem comissão não há
     * como precificar. Nos dois casos nada estoura: pedidos simplesmente param
     * de andar, e a falha aparece longe da causa — motoboy online sem receber
     * nada, loja sem entender. É exatamente o tipo de coisa que um aviso na
     * Home resolve e nenhum log resolve.
     */
    if (settings.dispatchOfferTimeoutSeconds === null) {
      items.push({
        id: 'admin:settings:dispatch-timeout',
        severity: 'critical',
        title: 'Despacho parado por falta de configuração',
        description:
          'O tempo de resposta da oferta não está definido. Nenhum pedido é ofertado enquanto isso.',
        href: '/configuracoes/operacao',
        actionLabel: 'Configurar agora',
      });
    }

    if (settings.driverCommissionPercentage === null) {
      items.push({
        id: 'admin:settings:driver-commission',
        severity: 'critical',
        title: 'Comissão do entregador não configurada',
        description: 'Sem ela não é possível precificar nenhum pedido novo.',
        href: '/configuracoes/operacao',
        actionLabel: 'Configurar agora',
      });
    }

    if (vencidas._count._all > 0) {
      items.push({
        id: 'admin:invoices:overdue',
        severity: 'critical',
        title: pluralizar(vencidas._count._all, 'fatura vencida', 'faturas vencidas'),
        description: `${formatarValor(Number(vencidas._sum.totalValue ?? 0))} em atraso no total.`,
        // Direto na aba, e nao em `/faturas` — aquele endereco so redireciona
        // para ca, e um salto a mais e um salto que pode se perder.
        href: '/financeiro?aba=faturas',
        actionLabel: 'Ver faturas',
      });
    }

    if (avisos > 0) {
      items.push({
        id: 'admin:payment-notices:pending',
        severity: 'warning',
        title: pluralizar(avisos, 'aviso de pagamento', 'avisos de pagamento'),
        description: 'Uma empresa informou pagamento e espera confirmação ou recusa.',
        href: '/financeiro?aba=avisos',
        actionLabel: 'Conferir',
      });
    }

    if (empresas > 0) {
      items.push({
        id: 'admin:companies:pending-approval',
        severity: 'warning',
        title: pluralizar(
          empresas,
          'empresa aguardando aprovação',
          'empresas aguardando aprovação',
        ),
        description: 'Elas não conseguem lançar pedidos até serem aprovadas.',
        href: '/clientes',
        actionLabel: 'Revisar',
      });
    }

    if (entregadores > 0) {
      items.push({
        id: 'admin:drivers:pending-approval',
        severity: 'warning',
        title: pluralizar(
          entregadores,
          'entregador aguardando aprovação',
          'entregadores aguardando aprovação',
        ),
        description: 'Eles não recebem oferta nenhuma até serem aprovados.',
        href: '/entregadores',
        actionLabel: 'Revisar',
      });
    }

    if (semMotoboy > 0) {
      items.push({
        id: 'admin:deliveries:awaiting-driver',
        severity: 'warning',
        title: pluralizar(semMotoboy, 'pedido sem entregador', 'pedidos sem entregador'),
        description: `Esperando há mais de ${MINUTOS_SEM_MOTOBOY} minutos.`,
        href: '/pedidos',
        actionLabel: 'Ver fila',
      });
    }

    return { items, criticalCount: items.filter((item) => item.severity === 'critical').length };
  }
}

function pluralizar(quantidade: number, singular: string, plural: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : plural}`;
}

function formatarValor(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
