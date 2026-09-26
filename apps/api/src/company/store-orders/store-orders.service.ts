import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AndamentoDoPedido,
  Cancelamento,
  EnderecoDaEntrega,
  ItemDoPedido,
  JanelaAgendada,
  PassoDoPedido,
  PedidoDaLoja,
  PublicStoreProduct,
} from '@motoboycity/types';
import {
  MOTIVO_DO_PRAZO,
  TransicaoInvalida,
  avancar,
  chamarMotoboyCity,
  horariosDaModalidade,
  inicioDoPedido,
  modalidadesAtivas,
  pedidoMinimoDa,
  podeChamarMotoboyCity,
  prazoDoAceite,
  situacaoDaLoja,
  type StoreCheckoutPayload,
  type StoreOrderStagePayload,
} from '@motoboycity/validation';
import { Prisma, type StoreOrder, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreCatalogService } from '../store-catalog/store-catalog.service';
import { StoreOperationService } from '../store-operation/store-operation.service';

/** Reais: a conta é feita em centavos para 0,1 + 0,2 não virar 0,30000000000000004. */
function reais(centavos: number): number {
  return Math.round(centavos) / 100;
}

function centavos(valor: number): number {
  return Math.round(valor * 100);
}

function recusa(message: string, code: string, extra: Record<string, unknown> = {}) {
  return new BadRequestException({ message, code, ...extra });
}

type ItemPedido = StoreCheckoutPayload['itens'][number];

/**
 * O preço de uma linha da sacola, conferido contra o cardápio publicado. Cada
 * recusa diz o nome do que mudou: "o tamanho 700ml acabou" leva o cliente a
 * trocar o item; "item inválido" o faz desistir.
 */
function precificar(item: ItemPedido, produto: PublicStoreProduct | undefined): ItemDoPedido {
  if (!produto) {
    throw new ConflictException({
      message: 'Um item da sacola saiu do cardápio. Confira a sacola e tente de novo.',
      code: 'STORE_ORDER_ITEM_UNAVAILABLE',
    });
  }

  let base: number;
  let tamanho: string | null = null;
  if (produto.sizes.length > 0) {
    const escolhido = produto.sizes.find((opcao) => opcao.id === item.tamanhoId);
    if (!escolhido) {
      throw recusa(`Escolha o tamanho de ${produto.name}.`, 'STORE_ORDER_ITEM_INVALID');
    }
    if (!escolhido.available) {
      throw new ConflictException({
        message: `O tamanho ${escolhido.name} de ${produto.name} acabou.`,
        code: 'STORE_ORDER_ITEM_UNAVAILABLE',
      });
    }
    base = escolhido.price;
    tamanho = escolhido.name;
  } else {
    if (item.tamanhoId !== null || produto.price === null) {
      throw recusa(`${produto.name} não tem tamanhos.`, 'STORE_ORDER_ITEM_INVALID');
    }
    base = produto.price;
  }

  const escolhidas = new Set(item.escolhas);
  let adicionais = 0;
  const nomes: string[] = [];
  let achadas = 0;
  for (const grupo of produto.optionGroups) {
    const doGrupo = grupo.options.filter((opcao) => escolhidas.has(opcao.id));
    achadas += doGrupo.length;
    for (const opcao of doGrupo) {
      if (!opcao.available) {
        throw new ConflictException({
          message: `${opcao.name} acabou. Tire da escolha de ${produto.name} e peça de novo.`,
          code: 'STORE_ORDER_ITEM_UNAVAILABLE',
        });
      }
      adicionais += centavos(opcao.price);
      nomes.push(opcao.name);
    }
    if (doGrupo.length < grupo.minChoices) {
      throw recusa(
        `Em ${produto.name}, escolha pelo menos ${grupo.minChoices} em "${grupo.name}".`,
        'STORE_ORDER_ITEM_INVALID',
      );
    }
    if (grupo.maxChoices !== null && doGrupo.length > grupo.maxChoices) {
      throw recusa(
        `Em ${produto.name}, escolha no máximo ${grupo.maxChoices} em "${grupo.name}".`,
        'STORE_ORDER_ITEM_INVALID',
      );
    }
  }
  if (achadas !== escolhidas.size) {
    throw new ConflictException({
      message: `Uma escolha de ${produto.name} saiu do cardápio. Monte o item de novo.`,
      code: 'STORE_ORDER_ITEM_UNAVAILABLE',
    });
  }

  const unitario = centavos(base) + adicionais;
  return {
    produtoId: produto.id,
    nome: produto.name,
    tamanho,
    escolhas: nomes,
    quantidade: item.quantidade,
    unitario: reais(unitario),
    total: reais(unitario * item.quantidade),
  };
}

function paraPedido(linha: StoreOrder): PedidoDaLoja {
  const janela: JanelaAgendada | null =
    linha.scheduledStart && linha.scheduledEnd
      ? { inicio: linha.scheduledStart.toISOString(), fim: linha.scheduledEnd.toISOString() }
      : null;
  return {
    id: linha.id,
    numero: linha.number,
    criadoEm: linha.createdAt.toISOString(),
    modalidade: linha.modality,
    etapa: linha.stage,
    historico: linha.history as unknown as PassoDoPedido[],
    janela,
    minutosDePreparo: linha.prepMinutes,
    minutosDeEntrega: linha.deliveryMinutes,
    cancelamento:
      linha.stage === 'CANCELADO'
        ? { motivo: linha.cancelReason ?? '', por: linha.cancelledBy ?? 'LOJA' }
        : null,
    entregaPor: linha.courier,
    cliente: { nome: linha.customerName, telefone: linha.customerPhone },
    itens: linha.items as unknown as ItemDoPedido[],
    subtotal: Number(linha.subtotal),
    taxaDeEntrega: Number(linha.deliveryFee),
    total: Number(linha.total),
    pagamento: linha.paymentMethod as PedidoDaLoja['pagamento'],
    trocoPara: linha.changeFor === null ? null : Number(linha.changeFor),
    entrega: linha.address as unknown as EnderecoDaEntrega | null,
    observacao: linha.note,
  };
}

/**
 * O pedido da loja online, do lado do cliente: fazer e acompanhar.
 *
 * O servidor confere tudo o que a página já conferiu, com as mesmas regras
 * (`@motoboycity/validation`): a página pode ter ficado aberta enquanto a loja
 * fechou, um tamanho acabou ou o preço mudou, e o navegador não é quem decide.
 */
@Injectable()
export class StoreOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogo: StoreCatalogService,
    private readonly operacao: StoreOperationService,
  ) {}

  async checkout(
    slug: string,
    clienteId: string,
    pedido: StoreCheckoutPayload,
  ): Promise<PedidoDaLoja> {
    const companyId = await this.lojaQueRecebe(slug);
    const [operacao, cardapio] = await Promise.all([
      this.operacao.publicOperation(companyId),
      this.catalogo.publicCatalog(companyId),
    ]);
    const agora = new Date();

    if (!modalidadesAtivas(operacao).includes(pedido.modalidade)) {
      throw recusa(
        pedido.modalidade === 'ENTREGA'
          ? 'Esta loja não está fazendo entrega pela página.'
          : 'Esta loja não está fazendo retirada pela página.',
        'STORE_ORDER_MODALITY_OFF',
      );
    }

    const produtos = new Map(cardapio.products.map((produto) => [produto.id, produto]));
    const itens = pedido.itens.map((item) => precificar(item, produtos.get(item.produtoId)));
    const subtotal = itens.reduce((soma, item) => soma + centavos(item.total), 0);

    const minimo = pedidoMinimoDa(operacao, pedido.modalidade);
    if (minimo !== null && subtotal < centavos(minimo)) {
      throw recusa(
        `O pedido mínimo para entrega é de R$ ${minimo.toFixed(2).replace('.', ',')}, sem a taxa.`,
        'STORE_ORDER_BELOW_MINIMUM',
      );
    }

    let janela: JanelaAgendada | null = null;
    if (pedido.agendadoPara === null) {
      if (!situacaoDaLoja(operacao.funcionamento, agora).aberta) {
        throw new ConflictException({
          message: 'A loja não está recebendo pedidos para agora.',
          code: 'STORE_CLOSED',
        });
      }
    } else {
      const inicio = new Date(pedido.agendadoPara).getTime();
      const vale = horariosDaModalidade(operacao, pedido.modalidade, agora).some((dia) =>
        dia.horarios.some((horario) => horario.getTime() === inicio),
      );
      if (!vale) {
        throw new ConflictException({
          message: 'Esse horário não está mais disponível. Escolha outro.',
          code: 'STORE_ORDER_SLOT_UNAVAILABLE',
        });
      }
      janela = {
        inicio: new Date(inicio).toISOString(),
        fim: new Date(inicio + operacao.agendamento.intervaloMin * 60_000).toISOString(),
      };
    }

    let taxa = 0;
    let endereco: EnderecoDaEntrega | null = null;
    if (pedido.modalidade === 'ENTREGA' && pedido.entrega) {
      const bairro = operacao.bairros.find((item) => item.id === pedido.entrega?.bairroId);
      if (!bairro) {
        throw recusa('A loja não entrega nesse bairro.', 'STORE_ORDER_AREA_UNAVAILABLE');
      }
      taxa = centavos(bairro.taxa);
      const { bairroId: _bairroId, ...resto } = pedido.entrega;
      endereco = { ...resto, bairro: bairro.nome };
    }

    if (!operacao.pagamentos.includes(pedido.pagamento)) {
      throw recusa(
        'Esta forma de pagamento não está disponível nesta loja.',
        'STORE_ORDER_PAYMENT_UNAVAILABLE',
      );
    }

    const total = subtotal + taxa;
    if (Math.abs(centavos(pedido.totalVisto) - total) > 0) {
      throw new ConflictException({
        message: `O total mudou para R$ ${reais(total).toFixed(2).replace('.', ',')}. Confira a sacola.`,
        code: 'STORE_ORDER_TOTAL_CHANGED',
        total: reais(total),
      });
    }
    if (pedido.trocoPara !== null && centavos(pedido.trocoPara) < total) {
      throw recusa(
        'O troco tem que ser para um valor maior que o total.',
        'STORE_ORDER_CHANGE_TOO_LOW',
      );
    }

    const { minutosDePreparo, minutosDeEntrega, modo, prazoDoAceiteMin } = operacao.recebimento;
    const inicio = inicioDoPedido(modo, agora);
    const entregaPor = pedido.modalidade === 'ENTREGA' ? operacao.entrega.quemEntrega : null;
    const andamento: AndamentoDoPedido = {
      numero: 0,
      modalidade: pedido.modalidade,
      etapa: inicio.etapa,
      historico: inicio.historico,
      janela,
      minutosDePreparo,
      minutosDeEntrega,
      cancelamento: null,
      entregaPor,
    };
    const prazo = prazoDoAceite(andamento, prazoDoAceiteMin);

    const dados = {
      customerAuthId: clienteId,
      customerName: pedido.cliente.nome,
      customerPhone: pedido.cliente.telefone,
      modality: pedido.modalidade,
      stage: inicio.etapa,
      courier: entregaPor,
      history: inicio.historico as unknown as Prisma.InputJsonValue,
      scheduledStart: janela ? new Date(janela.inicio) : null,
      scheduledEnd: janela ? new Date(janela.fim) : null,
      prepMinutes: minutosDePreparo,
      deliveryMinutes: minutosDeEntrega,
      acceptDeadline: prazo,
      address: endereco ? (endereco as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      items: itens as unknown as Prisma.InputJsonValue,
      subtotal: reais(subtotal),
      deliveryFee: reais(taxa),
      total: reais(total),
      paymentMethod: pedido.pagamento,
      changeFor: pedido.trocoPara,
      note: pedido.observacao || null,
    } satisfies Omit<Prisma.StoreOrderUncheckedCreateInput, 'companyId' | 'number'>;

    return paraPedido(await this.gravarComNumero(companyId, dados));
  }

  /** Os pedidos deste cliente nesta loja, do mais novo ao mais antigo. */
  async pedidosDoCliente(slug: string, clienteId: string): Promise<PedidoDaLoja[]> {
    const link = await this.prisma.storeSlug.findUnique({
      where: { slug },
      select: { companyId: true },
    });
    if (!link)
      throw new NotFoundException({ message: 'Loja não encontrada.', code: 'STORE_NOT_FOUND' });
    await this.cancelarVencidos(link.companyId);
    const linhas = await this.prisma.storeOrder.findMany({
      where: { companyId: link.companyId, customerAuthId: clienteId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return linhas.map(paraPedido);
  }

  /*
   * O lado da loja, no painel: a fila de Vendas e o que a loja faz com cada
   * pedido.
   */

  /**
   * A fila de Vendas: tudo o que ainda está andando — agendados incluídos — e o
   * que terminou nos últimos dois dias.
   */
  async vendas(user: User): Promise<PedidoDaLoja[]> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    await this.cancelarVencidos(companyId);
    const desde = new Date(Date.now() - 2 * 24 * 60 * 60_000);
    const linhas = await this.prisma.storeOrder.findMany({
      where: {
        companyId,
        OR: [{ stage: { notIn: ['ENTREGUE', 'CANCELADO'] } }, { updatedAt: { gte: desde } }],
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return linhas.map(paraPedido);
  }

  /**
   * Leva o pedido à etapa seguinte, pela regra de `avancar`: uma etapa por vez,
   * só para a frente. Pedir a etapa em que ele já está devolve o pedido — dois
   * toques no mesmo botão, ou duas abas, não são erro.
   */
  async avancarEtapa(
    user: User,
    id: string,
    { para, minutosDePreparo }: StoreOrderStagePayload,
  ): Promise<PedidoDaLoja> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    return this.mudar(companyId, id, (pedido, agora) => {
      const andado = avancar(pedido, para, agora);
      if (andado === pedido) return null;
      const aceite = para === 'ACEITO';
      return {
        stage: andado.etapa,
        history: andado.historico as unknown as Prisma.InputJsonValue,
        // Aceito, o prazo do aceite deixa de existir.
        ...(aceite ? { acceptDeadline: null } : {}),
        ...(aceite && minutosDePreparo ? { prepMinutes: minutosDePreparo } : {}),
      };
    });
  }

  async cancelar(user: User, id: string, motivo: string): Promise<PedidoDaLoja> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    return this.mudar(companyId, id, (pedido, agora) =>
      this.dadosDoCancelamento(pedido, agora, { motivo, por: 'LOJA' }),
    );
  }

  /** O pedido do entregador da loja passa para o MOTOboyCity — num dia de aperto. */
  async chamarMotoboy(user: User, id: string): Promise<PedidoDaLoja> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    return this.mudar(companyId, id, (pedido) => {
      if (pedido.entregaPor === 'MOTOBOYCITY' && pedido.modalidade === 'ENTREGA') return null;
      if (!podeChamarMotoboyCity(pedido)) {
        throw new ConflictException({
          message: 'Este pedido não pode mais passar para o MOTOboyCity.',
          code: 'STORE_ORDER_STAGE_INVALID',
        });
      }
      return { courier: chamarMotoboyCity(pedido).entregaPor };
    });
  }

  /**
   * Cancela os pedidos que esperaram o aceite além do prazo. Roda a cada
   * leitura da fila e dos pedidos do cliente: quem olha vê o pedido já caído,
   * sem depender de uma tarefa agendada.
   */
  private async cancelarVencidos(companyId: string): Promise<void> {
    const agora = new Date();
    const vencidos = await this.prisma.storeOrder.findMany({
      where: { companyId, stage: 'NOVO', acceptDeadline: { lte: agora } },
      select: { id: true },
    });
    for (const { id } of vencidos) {
      await this.mudar(companyId, id, (pedido, momento) =>
        pedido.etapa === 'NOVO'
          ? this.dadosDoCancelamento(pedido, momento, { motivo: MOTIVO_DO_PRAZO, por: 'SISTEMA' })
          : null,
      ).catch(() => undefined);
    }
  }

  private dadosDoCancelamento(
    pedido: PedidoDaLoja,
    agora: Date,
    cancelamento: Cancelamento,
  ): Prisma.StoreOrderUpdateManyMutationInput | null {
    const andado = avancar(pedido, 'CANCELADO', agora, cancelamento);
    if (andado === pedido) return null;
    return {
      stage: 'CANCELADO',
      history: andado.historico as unknown as Prisma.InputJsonValue,
      acceptDeadline: null,
      cancelReason: cancelamento.motivo,
      cancelledBy: cancelamento.por,
    };
  }

  /**
   * Muda o pedido só se ele ainda estiver como foi lido (`updatedAt`): outra aba
   * pode ter aceitado ou cancelado no meio. Se mudou, relê e tenta de novo —
   * a regra decide com o estado novo. `null` do `calcular`: nada a mudar.
   */
  private async mudar(
    companyId: string,
    id: string,
    calcular: (
      pedido: PedidoDaLoja,
      agora: Date,
    ) => Prisma.StoreOrderUpdateManyMutationInput | null,
  ): Promise<PedidoDaLoja> {
    for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
      const linha = await this.prisma.storeOrder.findFirst({ where: { id, companyId } });
      if (!linha) {
        throw new NotFoundException({
          message: 'Pedido não encontrado.',
          code: 'STORE_ORDER_NOT_FOUND',
        });
      }
      let dados: Prisma.StoreOrderUpdateManyMutationInput | null;
      try {
        dados = calcular(paraPedido(linha), new Date());
      } catch (erro) {
        if (erro instanceof TransicaoInvalida) {
          throw new ConflictException({
            message: 'Este pedido já mudou de etapa. A tela vai se atualizar.',
            code: 'STORE_ORDER_STAGE_INVALID',
          });
        }
        throw erro;
      }
      if (!dados) return paraPedido(linha);
      const { count } = await this.prisma.storeOrder.updateMany({
        where: { id, companyId, updatedAt: linha.updatedAt },
        data: dados,
      });
      if (count === 1) {
        return paraPedido(await this.prisma.storeOrder.findFirstOrThrow({ where: { id } }));
      }
    }
    throw new ConflictException({
      message: 'O pedido mudou enquanto você mexia nele. Tente de novo.',
      code: 'STORE_ORDER_STALE',
    });
  }

  /**
   * A loja do link, se ela recebe pedido agora. Link antigo também vale: é a
   * mesma loja, e o pedido não pode cair só porque a página estava aberta
   * quando ela trocou de endereço.
   */
  private async lojaQueRecebe(slug: string): Promise<string> {
    const link = await this.prisma.storeSlug.findUnique({
      where: { slug },
      select: {
        company: {
          select: { id: true, status: true, storeSettings: { select: { acceptsOrders: true } } },
        },
      },
    });
    const empresa = link?.company;
    if (!empresa || empresa.status !== 'ACTIVE' || !empresa.storeSettings) {
      throw new NotFoundException({ message: 'Loja não encontrada.', code: 'STORE_NOT_FOUND' });
    }
    if (!empresa.storeSettings.acceptsOrders) {
      throw new ConflictException({
        message: 'Esta loja ainda não recebe pedidos por aqui.',
        code: 'STORE_NOT_ACCEPTING_ORDERS',
      });
    }
    return empresa.id;
  }

  /**
   * O número é o seguinte ao último da loja. Dois pedidos ao mesmo tempo podem
   * tirar o mesmo número: o segundo esbarra na chave única e tenta de novo.
   */
  private async gravarComNumero(
    companyId: string,
    dados: Omit<Prisma.StoreOrderUncheckedCreateInput, 'companyId' | 'number'>,
  ): Promise<StoreOrder> {
    for (let tentativa = 1; ; tentativa += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const ultimo = await tx.storeOrder.aggregate({
            where: { companyId },
            _max: { number: true },
          });
          return tx.storeOrder.create({
            data: { ...dados, companyId, number: (ultimo._max.number ?? 0) + 1 },
          });
        });
      } catch (erro) {
        const repetido =
          erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002';
        if (!repetido || tentativa >= 5) throw erro;
      }
    }
  }
}
