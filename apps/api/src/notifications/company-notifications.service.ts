import { ForbiddenException, Injectable } from '@nestjs/common';
import type { NotificationItem, NotificationsResult } from '@motoboycity/types';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceService } from '../finance/invoice.service';

/** Uma entrega parada além disso já é assunto de alguém, não espera normal. */
const MINUTOS_SEM_MOTOBOY = 15;
/** Fatura entra no radar antes de vencer; depois de vencida ela já é crítica. */
const DIAS_DE_ANTECEDENCIA_DO_VENCIMENTO = 3;

@Injectable()
export class CompanyNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoiceService: InvoiceService,
  ) {}

  private async resolverEmpresa(user: User): Promise<string> {
    const membro = await this.prisma.companyTeamMember.findFirst({
      where: { userId: user.id, active: true },
      select: { companyId: true },
    });
    if (!membro) {
      throw new ForbiddenException('Usuário não está vinculado a uma empresa.');
    }
    return membro.companyId;
  }

  async list(user: User): Promise<NotificationsResult> {
    const companyId = await this.resolverEmpresa(user);

    /**
     * Atualiza o vencimento antes de contar, como faz a posição financeira.
     * Sem isto, a fatura que venceu hoje ainda apareceria como "a vencer" —
     * justamente no dia em que a loja precisa agir.
     */
    await this.invoiceService.refreshOverdueInvoices();

    const agora = new Date();
    const limiteDeEspera = new Date(agora.getTime() - MINUTOS_SEM_MOTOBOY * 60_000);
    const limiteDoVencimento = new Date(agora);
    limiteDoVencimento.setDate(limiteDoVencimento.getDate() + DIAS_DE_ANTECEDENCIA_DO_VENCIMENTO);

    const [vencidas, aVencer, avisoRecusado, semMotoboy, endereco] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { companyId, status: 'OVERDUE' },
        _count: { _all: true },
        _sum: { totalValue: true },
      }),
      this.prisma.invoice.count({
        where: { companyId, status: 'PENDING', dueDate: { lte: limiteDoVencimento } },
      }),
      this.prisma.invoicePaymentNotice.count({
        where: {
          status: 'REJECTED',
          invoice: { companyId, status: { in: ['PENDING', 'OVERDUE'] } },
        },
      }),
      this.prisma.delivery.count({
        where: { companyId, status: 'AWAITING_DRIVER', createdAt: { lte: limiteDeEspera } },
      }),
      this.prisma.companyAddress.findFirst({
        where: { companyId, isPrimary: true },
        select: { lat: true, lng: true },
      }),
    ]);

    const items: NotificationItem[] = [];

    if (vencidas._count._all > 0) {
      items.push({
        id: 'company:invoices:overdue',
        severity: 'critical',
        title: pluralizar(vencidas._count._all, 'fatura vencida', 'faturas vencidas'),
        description: `${formatarValor(Number(vencidas._sum.totalValue ?? 0))} em atraso. O acesso da empresa pode ser suspenso conforme o prazo configurado.`,
        href: '/faturas',
        actionLabel: 'Ver faturas',
      });
    }

    if (aVencer > 0) {
      items.push({
        id: 'company:invoices:due-soon',
        severity: 'warning',
        title: pluralizar(aVencer, 'fatura vence em breve', 'faturas vencem em breve'),
        description: `Vencimento nos próximos ${DIAS_DE_ANTECEDENCIA_DO_VENCIMENTO} dias.`,
        href: '/faturas',
        actionLabel: 'Ver faturas',
      });
    }

    /**
     * O aviso de pagamento recusado precisa aparecer porque a loja fez a parte
     * dela e o dinheiro continua em aberto: sem isto, ela acha que avisou e
     * espera, enquanto a fatura corre para o vencimento.
     */
    if (avisoRecusado > 0) {
      items.push({
        id: 'company:payment-notice:rejected',
        severity: 'warning',
        title: 'Aviso de pagamento recusado',
        description:
          'A administração não confirmou um pagamento que você informou. Corrija os dados e envie de novo.',
        href: '/faturas',
        actionLabel: 'Rever aviso',
      });
    }

    if (semMotoboy > 0) {
      items.push({
        id: 'company:deliveries:awaiting-driver',
        severity: 'warning',
        title: pluralizar(semMotoboy, 'pedido sem entregador', 'pedidos sem entregador'),
        description: `Esperando há mais de ${MINUTOS_SEM_MOTOBOY} minutos.`,
        href: '/pedidos',
        actionLabel: 'Ver pedidos',
      });
    }

    /**
     * Endereço de coleta sem coordenada é silencioso por natureza: nada falha
     * na hora, e a conta chega no motoboy, que trava na validação de
     * proximidade sem ter como resolver.
     */
    if (endereco && (endereco.lat === null || endereco.lng === null)) {
      items.push({
        id: 'company:address:missing-coordinates',
        severity: 'warning',
        title: 'Endereço de coleta sem localização',
        description:
          'A coleta e o retorno seguem sem conferência de proximidade até o endereço ser salvo com o ponto no mapa.',
        href: '/',
        actionLabel: 'Revisar endereço',
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
