import { Injectable, Logger } from '@nestjs/common';
import type { EventoDoLojista, PedidoDaLoja } from '@motoboycity/types';
import {
  EVENTOS_DO_CLIENTE_OBRIGATORIOS,
  TITULO_DO_AVISO_DO_LOJISTA,
  avisoParaOCliente,
  eventoDoCliente,
  hora,
  momentoNaLoja,
  rotuloDoDia,
  type WebPushSubscriptionPayload,
} from '@motoboycity/validation';
import type { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WebPushService } from '../../web-push/web-push.service';
import { StoreOperationService } from '../store-operation/store-operation.service';

function moeda(valor: number): string {
  return `R$ ${valor.toFixed(2).replace('.', ',')}`;
}

/** "#42 · Ana · R$ 45,00 · entrega · para hoje às 12:00" — o mesmo do painel aberto. */
function resumoDaVenda(pedido: PedidoDaLoja, agora: Date): string {
  const partes = [`#${pedido.numero}`, pedido.cliente.nome, moeda(pedido.total)];
  partes.push(pedido.modalidade === 'RETIRADA' ? 'retirada' : 'entrega');
  if (pedido.janela) {
    const inicio = new Date(pedido.janela.inicio);
    partes.push(`para ${rotuloDoDia(momentoNaLoja(inicio).data, agora)} às ${hora(inicio)}`);
  }
  return partes.join(' · ');
}

/**
 * Quem fica sabendo de cada pedido com a página fechada, pelo Web Push.
 *
 * A loja: pedido novo (ou agendado) e pedido cancelado por outra ponta — o
 * cliente ou o sistema; o que ela mesma cancela não avisa. O cliente: cada
 * etapa que a loja deixou ligada em Notificações, e sempre o cancelamento. As
 * palavras são as do painel (`store-notification.rules.ts`), e a etiqueta de
 * cada aviso da loja é a mesma que o painel aberto usa (`venda-<número>`): se
 * os dois mostrarem, um substitui o outro.
 *
 * Nada aqui lança: o aviso é consequência do pedido, e não parte dele.
 */
@Injectable()
export class StoreOrderNotificationsService {
  private readonly logger = new Logger(StoreOrderNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly operacao: StoreOperationService,
    private readonly webPush: WebPushService,
  ) {}

  /** O painel deste aparelho passa a receber os avisos da loja. */
  async inscreverLoja(
    user: User,
    companyId: string,
    { endpoint, keys }: WebPushSubscriptionPayload,
  ): Promise<void> {
    const dados = {
      companyId,
      audience: 'LOJA' as const,
      userId: user.id,
      customerAuthId: null,
      p256dh: keys.p256dh,
      auth: keys.auth,
    };
    await this.prisma.webPushSubscription.upsert({
      where: { endpoint },
      create: { ...dados, endpoint },
      update: dados,
    });
  }

  /** O cliente, neste aparelho, passa a receber os avisos dos pedidos dele nesta loja. */
  async inscreverCliente(
    companyId: string,
    clienteId: string,
    { endpoint, keys }: WebPushSubscriptionPayload,
  ): Promise<void> {
    const dados = {
      companyId,
      audience: 'CLIENTE' as const,
      userId: null,
      customerAuthId: clienteId,
      p256dh: keys.p256dh,
      auth: keys.auth,
    };
    await this.prisma.webPushSubscription.upsert({
      where: { endpoint },
      create: { ...dados, endpoint },
      update: dados,
    });
  }

  /** Só apaga o que é de quem pede: a loja o dela, o cliente o dele. */
  async desinscrever(
    companyId: string,
    endpoint: string,
    dono: { userId: string } | { customerAuthId: string },
  ): Promise<void> {
    await this.prisma.webPushSubscription.deleteMany({ where: { endpoint, companyId, ...dono } });
  }

  /** O pedido acabou de chegar: a loja fica sabendo, e o cliente recebe o "recebido". */
  async pedidoNovo(companyId: string, pedido: PedidoDaLoja): Promise<void> {
    await this.semDerrubar(async () => {
      await this.avisarLoja(companyId, pedido.janela ? 'PEDIDO_AGENDADO' : 'NOVO_PEDIDO', pedido);
      await this.avisarCliente(companyId, pedido);
    });
  }

  /**
   * A etapa mudou — pela loja, pelo sistema (prazo do aceite) ou pela corrida.
   * Mudança de outra coisa (quem entrega) não avisa ninguém.
   */
  async etapaMudou(companyId: string, antes: PedidoDaLoja, depois: PedidoDaLoja): Promise<void> {
    if (antes.etapa === depois.etapa) return;
    await this.semDerrubar(async () => {
      if (depois.etapa === 'CANCELADO' && depois.cancelamento?.por !== 'LOJA') {
        await this.avisarLoja(companyId, 'PEDIDO_CANCELADO', depois);
      }
      await this.avisarCliente(companyId, depois);
    });
  }

  private async avisarLoja(
    companyId: string,
    evento: EventoDoLojista,
    pedido: PedidoDaLoja,
  ): Promise<void> {
    if (!this.webPush.disponivel()) return;
    const operacao = await this.operacao.operacaoDaEmpresa(companyId);
    if (!operacao.notificacoes.lojista[evento].push) return;
    const inscricoes = await this.prisma.webPushSubscription.findMany({
      where: { companyId, audience: 'LOJA' },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    await this.webPush.enviar(inscricoes, {
      titulo: TITULO_DO_AVISO_DO_LOJISTA[evento],
      corpo: resumoDaVenda(pedido, new Date()),
      url: '/loja/vendas',
      etiqueta: `venda-${pedido.numero}`,
    });
  }

  private async avisarCliente(companyId: string, pedido: PedidoDaLoja): Promise<void> {
    if (!this.webPush.disponivel()) return;
    const evento = eventoDoCliente(pedido.modalidade, pedido.etapa);
    if (!evento) return;
    const operacao = await this.operacao.operacaoDaEmpresa(companyId);
    const ligado =
      EVENTOS_DO_CLIENTE_OBRIGATORIOS.includes(evento) || operacao.notificacoes.cliente[evento];
    if (!ligado) return;
    const [inscricoes, loja] = await Promise.all([
      this.prisma.storeOrder
        .findUnique({ where: { id: pedido.id }, select: { customerAuthId: true } })
        .then((linha) =>
          linha
            ? this.prisma.webPushSubscription.findMany({
                where: { companyId, audience: 'CLIENTE', customerAuthId: linha.customerAuthId },
                select: { id: true, endpoint: true, p256dh: true, auth: true },
              })
            : [],
        ),
      this.prisma.storeSettings.findUnique({
        where: { companyId },
        select: { name: true, slug: true },
      }),
    ]);
    if (!loja) return;
    await this.webPush.enviar(inscricoes, {
      titulo: loja.name,
      corpo: avisoParaOCliente(
        evento,
        pedido.numero,
        pedido.modalidade,
        pedido.cancelamento?.motivo,
      ),
      url: `/pedir/${loja.slug}/pedidos`,
      etiqueta: `pedido-${pedido.numero}`,
    });
  }

  private async semDerrubar(avisar: () => Promise<void>): Promise<void> {
    try {
      await avisar();
    } catch (erro) {
      this.logger.warn(
        `Aviso do pedido não enviado: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
    }
  }
}
