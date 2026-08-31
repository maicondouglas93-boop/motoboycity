import { Injectable } from '@nestjs/common';
import type { NotificationItem, NotificationsResult } from '@motoboycity/types';
import { PrismaService } from '../prisma/prisma.service';
import { AdminPlatformSettingsService } from '../admin/platform-settings/admin-platform-settings.service';
import { InvoiceService } from '../finance/invoice.service';
import {
  BACKUP_ABANDONADO_DIAS,
  BACKUP_ATRASADO_HORAS,
  BACKUP_JOB,
  JobCheckInService,
} from './job-check-in.service';

/** Mesma régua da empresa: além disso, alguém precisa olhar. */
const MINUTOS_SEM_MOTOBOY = 15;

/**
 * Repasse vencido e ainda pendente: a partir daqui não é corrida de horário, é
 * falha.
 *
 * `releaseAt` é sempre segunda 00:00 no fuso da operação, e o job semanal roda
 * segunda 00:00 — os dois disparam no mesmo instante. Seis horas depois, a
 * única explicação para o crédito continuar `PENDING` é que a liberação não
 * aconteceu.
 */
const HORAS_REPASSE_ATRASADO = 6;

/** Dois dias sem o motoboy poder sacar o que é dele já não é atraso. */
const DIAS_REPASSE_ABANDONADO = 2;

@Injectable()
export class AdminNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettings: AdminPlatformSettingsService,
    private readonly invoiceService: InvoiceService,
    private readonly jobCheckIn: JobCheckInService,
  ) {}

  async list(): Promise<NotificationsResult> {
    await this.invoiceService.refreshOverdueInvoices();

    const agora = Date.now();
    const limiteDeEspera = new Date(agora - MINUTOS_SEM_MOTOBOY * 60_000);
    const limiteDoRepasse = new Date(agora - HORAS_REPASSE_ATRASADO * 3_600_000);
    const [settings, empresas, entregadores, avisos, vencidas, semMotoboy, backup, repasses] =
      await Promise.all([
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
        this.jobCheckIn.ultimoAviso(BACKUP_JOB),
        /**
         * O dinheiro do motoboy que já deveria ter saído de bloqueado.
         *
         * `_min` do vencimento vem junto para o aviso dizer há quanto tempo, e
         * não só quantos: "3 repasses parados" não diz se é de hoje de manhã ou
         * de duas semanas atrás.
         */
        this.prisma.walletTransaction.aggregate({
          where: {
            type: 'CREDIT_REPASSE',
            status: 'PENDING',
            releaseAt: { lte: limiteDoRepasse },
          },
          _count: { _all: true },
          _sum: { amount: true },
          _min: { releaseAt: true },
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

    /**
     * Repasse vencido e não liberado — o aviso que devolve o alarme perdido.
     *
     * Até 31/08/2026, quando a liberação falhava o sintoma era barulhento: o
     * erro subia pelo `onModuleInit` e a API não subia. Proteger o arranque
     * (necessário, porque a liberação é rede de segurança e não podia derrubar
     * a casa) trocou uma falha visível por uma linha de log que ninguém lê.
     *
     * Sem este aviso, o desfecho é o pior de todos: o crédito do motoboy fica
     * preso em `PENDING`, ele não consegue sacar, e nenhuma tela acusa nada.
     * Aqui a régua é o RESULTADO — dinheiro que já deveria estar disponível e
     * não está — e não o erro, que pode nem existir se o job parar de rodar.
     */
    if (repasses._count._all > 0) {
      const vencidoHa = repasses._min.releaseAt
        ? (Date.now() - repasses._min.releaseAt.getTime()) / 3_600_000
        : HORAS_REPASSE_ATRASADO;
      const abandonado = vencidoHa >= DIAS_REPASSE_ABANDONADO * 24;
      items.push({
        id: 'admin:repasses:overdue',
        severity: abandonado ? 'critical' : 'warning',
        title: pluralizar(
          repasses._count._all,
          'repasse vencido e não liberado',
          'repasses vencidos e não liberados',
        ),
        description: `${formatarValor(Number(repasses._sum.amount ?? 0))} presos há ${formatarEspera(vencidoHa)}. O motoboy não consegue sacar enquanto isso.`,
        href: '/financeiro?aba=carteiras',
        actionLabel: 'Ver carteiras',
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

    /**
     * O backup parou de dar sinal.
     *
     * A pergunta não é "o workflow falhou?" — perguntar isso ao GitHub só
     * detecta a falha que ele consegue reportar. Se a rotina for apagada,
     * desabilitada ou nunca chegar a agendar, o silêncio parece sucesso. Aqui a
     * AUSÊNCIA do aviso é o sinal, e ela cobre todos esses casos de uma vez.
     *
     * Vira crítico só depois de uma semana: um dia sem backup é problema, mas
     * não para a operação hoje; uma semana significa que ninguém olhou e a
     * única rede de proteção dos dados não existe mais.
     */
    const horasSemBackup = backup
      ? (Date.now() - backup.lastRunAt.getTime()) / 3_600_000
      : Number.POSITIVE_INFINITY;
    if (horasSemBackup >= BACKUP_ATRASADO_HORAS) {
      const abandonado = horasSemBackup >= BACKUP_ABANDONADO_DIAS * 24;
      items.push({
        id: 'admin:backup:stale',
        severity: abandonado ? 'critical' : 'warning',
        title: backup ? 'Backup do banco atrasado' : 'Backup do banco nunca confirmou',
        description: backup
          ? `Sem aviso de conclusão há ${formatarEspera(horasSemBackup)}. O último foi em ${formatarData(backup.lastRunAt)}.`
          : 'Nenhuma execução avisou que terminou. Confira os segredos e rode a rotina na mão.',
        href: null,
        actionLabel: null,
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

/**
 * Depois de dois dias, hora vira ruído: "192 horas" obriga a pessoa a dividir
 * de cabeça justamente no aviso em que a gravidade precisa ser óbvia.
 */
function formatarEspera(horas: number): string {
  if (horas < 48) {
    return pluralizar(Math.floor(horas), 'hora', 'horas');
  }
  return pluralizar(Math.floor(horas / 24), 'dia', 'dias');
}

function formatarData(data: Date): string {
  return data.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatarValor(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
