import { randomUUID } from 'node:crypto';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  AndamentoDoPedido,
  Cancelamento,
  CorridaDoPedido,
  EnderecoDaEntrega,
  FormaDePagamento,
  ItemDoPedido,
  JanelaAgendada,
  PagamentoOnlineDoPedido,
  PassoDoPedido,
  PedidoDaLoja,
  PublicStoreProduct,
  SituacaoDaCorrida,
} from '@motoboycity/types';
import {
  FORMAS_DE_PAGAMENTO_ONLINE,
  MOTIVO_DO_PRAZO,
  TransicaoInvalida,
  avancar,
  chamarMotoboyCity,
  concluido,
  createDeliverySchema,
  horariosDaModalidade,
  inicioDoPedido,
  momentoNaLoja,
  modalidadesAtivas,
  pagamentoConfirmado,
  pedidoMinimoDa,
  pelaCorrida,
  podeCancelar,
  podeChamarMotoboyCity,
  prazoDoAceite,
  prontoEm,
  segueACorrida,
  situacaoDaLoja,
  type CreateDeliveryPayload,
  type StoreCheckoutPayload,
  type StoreOrderStagePayload,
  type WebPushSubscriptionPayload,
} from '@motoboycity/validation';
import {
  Prisma,
  type DeliveryStatus,
  type StoreOrder,
  type StoreOrderPaymentStatus,
  type User,
} from '@prisma/client';
import { ZodError } from 'zod';
import { DeliveriesService } from '../../deliveries/deliveries.service';
import { AsaasProviderError } from '../../finance/asaas/asaas.client';
import type { AsaasWebhookEnvelope } from '../../finance/asaas/asaas.schemas';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreAsaasAccountService } from '../store-asaas/store-asaas-account.service';
import { StoreAsaasClient } from '../store-asaas/store-asaas.client';
import { StoreCatalogService } from '../store-catalog/store-catalog.service';
import { StoreOperationService } from '../store-operation/store-operation.service';
import { StoreOrderNotificationsService } from './store-order-notifications.service';

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

/** A corrida que o pedido lê junto, para a fila de Vendas e para acompanhá-la. */
const COM_A_CORRIDA = {
  delivery: {
    select: {
      id: true,
      displayNumber: true,
      status: true,
      scheduledAt: true,
      failedAt: true,
      driver: { select: { user: { select: { name: true } } } },
    },
  },
} satisfies Prisma.StoreOrderInclude;

type LinhaDoPedido = Prisma.StoreOrderGetPayload<{ include: typeof COM_A_CORRIDA }>;
type CorridaDaLinha = NonNullable<LinhaDoPedido['delivery']>;

const SITUACAO_DA_CORRIDA: Record<DeliveryStatus, SituacaoDaCorrida> = {
  SCHEDULED: 'AGENDADA',
  AWAITING_PAYMENT: 'AGUARDANDO_PAGAMENTO',
  AWAITING_DRIVER: 'BUSCANDO_MOTOBOY',
  ACCEPTED: 'MOTOBOY_A_CAMINHO',
  COLLECTED: 'COLETADA',
  DELIVERED: 'ENTREGUE',
  COMPLETED: 'ENTREGUE',
  FAILED: 'NAO_ENTREGUE',
  CANCELLED: 'CANCELADA',
};

/** `COMPLETED` também fecha a corrida que não entregou e voltou à loja. */
function situacaoDa(corrida: CorridaDaLinha): SituacaoDaCorrida {
  if (corrida.status === 'COMPLETED' && corrida.failedAt) return 'NAO_ENTREGUE';
  return SITUACAO_DA_CORRIDA[corrida.status];
}

/** As etapas em que o pedido tem (ou deveria ter) corrida andando. */
const ETAPAS_COM_CORRIDA: PedidoDaLoja['etapa'][] = ['ACEITO', 'EM_PREPARO', 'PRONTO'];

/** A corrida ainda está valendo: nem cancelada, nem terminada sem entregar. */
function corridaViva(corrida: CorridaDaLinha | null): corrida is CorridaDaLinha {
  if (!corrida) return false;
  const situacao = situacaoDa(corrida);
  return situacao !== 'CANCELADA' && situacao !== 'NAO_ENTREGUE';
}

const AVISO_CORRIDA_CANCELADA =
  'A central cancelou a corrida. Chame o motoboy de novo ou entregue com o entregador da loja.';
const AVISO_NAO_ENTREGUE =
  'O motoboy não conseguiu entregar e volta com o pedido. Combine com o cliente e decida.';
const AVISO_SEM_CORRIDA = 'O motoboy ainda não foi chamado para este pedido.';

/**
 * O que Vendas avisa sobre a corrida. A corrida andando apaga o aviso antigo
 * (a liberação recusada fora do horário deixa de importar quando a hora
 * chega); cancelada ou não entregue, o aviso é o dela. Aceito e sem corrida,
 * sempre há aviso — mesmo sem motivo gravado (o processo caiu entre o aceite e
 * a corrida) —, para a loja ter o botão de chamar.
 */
function avisoDaCorrida(linha: LinhaDoPedido, pedido: AndamentoDoPedido): string | null {
  if (!segueACorrida(pedido) || pedido.etapa === 'CANCELADO') return null;
  if (!linha.delivery) {
    return ETAPAS_COM_CORRIDA.includes(pedido.etapa)
      ? (linha.rideIssue ?? AVISO_SEM_CORRIDA)
      : null;
  }
  switch (situacaoDa(linha.delivery)) {
    case 'AGENDADA':
    case 'AGUARDANDO_PAGAMENTO':
      return linha.rideIssue;
    case 'CANCELADA':
      return concluido(pedido.etapa) ? null : (linha.rideIssue ?? AVISO_CORRIDA_CANCELADA);
    case 'NAO_ENTREGUE':
      return AVISO_NAO_ENTREGUE;
    default:
      return null;
  }
}

function paraCorrida(corrida: CorridaDaLinha): CorridaDoPedido {
  const situacao = situacaoDa(corrida);
  return {
    numero: corrida.displayNumber,
    situacao,
    agendadaPara:
      situacao === 'AGENDADA' && corrida.scheduledAt ? corrida.scheduledAt.toISOString() : null,
    motoboy: corrida.driver?.user.name.trim().split(/\s+/)[0] ?? null,
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
    corrida: null,
    avisoDaCorrida: null,
    pagamentoOnline: paraPagamento(linha),
  };
}

/**
 * O Pix do pedido. O QR code e o copia e cola só enquanto aguarda: pago ou
 * vencido, eles não servem para mais nada.
 */
function paraPagamento(linha: StoreOrder): PagamentoOnlineDoPedido | null {
  if (!linha.paymentStatus) return null;
  const aguardando = linha.paymentStatus === 'AGUARDANDO';
  return {
    situacao: linha.paymentStatus,
    pixCopiaECola: aguardando ? linha.pixPayload : null,
    qrCode: aguardando ? linha.pixQrCode : null,
    expiraEm: aguardando && linha.paymentDueAt ? linha.paymentDueAt.toISOString() : null,
    pagoEm: linha.paidAt ? linha.paidAt.toISOString() : null,
    aviso: null,
  };
}

/** O pedido para a loja: com a corrida, o aviso dela e o aviso do estorno. */
function paraALoja(linha: LinhaDoPedido): PedidoDaLoja {
  const pedido = paraPedido(linha);
  return {
    ...pedido,
    corrida: linha.delivery ? paraCorrida(linha.delivery) : null,
    avisoDaCorrida: avisoDaCorrida(linha, pedido),
    pagamentoOnline: pedido.pagamentoOnline
      ? { ...pedido.pagamentoOnline, aviso: linha.paymentIssue }
      : null,
  };
}

/** Quanto tempo o Pix vale. Passou, o pedido cai e a cobrança some do Asaas. */
const MINUTOS_DO_PIX = 15;

/** Quanto esperar entre uma tentativa de estorno recusada e a próxima. */
const INTERVALO_DO_ESTORNO_MS = 15 * 60_000;

/** O Asaas deu a cobrança como paga. */
function cobrancaPaga(status: string): boolean {
  return status === 'RECEIVED' || status === 'CONFIRMED' || status === 'RECEIVED_IN_CASH';
}

/** A frase que a loja lê em Vendas quando o estorno não saiu. */
function motivoDoEstorno(erro: unknown): string {
  if (erro instanceof AsaasProviderError && erro.httpStatus === 400) {
    return 'O Asaas recusou o estorno — confira se há saldo na sua conta Asaas. O sistema tenta de novo a cada 15 minutos.';
  }
  if (erro instanceof Error && erro.message === 'SEM_CONTA') {
    return 'A conta Asaas da loja foi desligada ou trocada: faça o estorno pelo painel do Asaas.';
  }
  return 'Não deu para estornar agora. O sistema tenta de novo a cada 15 minutos.';
}

function eOnline(forma: FormaDePagamento): boolean {
  return (FORMAS_DE_PAGAMENTO_ONLINE as readonly string[]).includes(forma);
}

function reaisPorExtenso(valor: number): string {
  return `R$ ${valor.toFixed(2).replace('.', ',')}`;
}

const COMO_O_CLIENTE_PAGA: Record<FormaDePagamento, string> = {
  PIX_ONLINE: 'Pix online',
  CREDITO_ONLINE: 'crédito online',
  DEBITO_ONLINE: 'débito online',
  DINHEIRO: 'dinheiro',
  PIX_MAQUININHA: 'Pix na maquininha',
  CREDITO_MAQUININHA: 'crédito na maquininha',
  DEBITO_MAQUININHA: 'débito na maquininha',
};

/**
 * O que o motoboy precisa saber do dinheiro, no formato da nota do aiqfome:
 * quanto cobrar, como, e o troco. A observação do cliente vai junto — é nela
 * que vem o "portão azul".
 */
function notaDoMotoboy(pedido: PedidoDaLoja): string {
  const pagamento = eOnline(pedido.pagamento)
    ? 'Pago online.'
    : `Pagamento na entrega: ${COMO_O_CLIENTE_PAGA[pedido.pagamento]}. Cobrar ${reaisPorExtenso(pedido.total)}.`;
  const troco =
    pedido.pagamento === 'DINHEIRO' && pedido.trocoPara !== null
      ? ` Troco para ${reaisPorExtenso(pedido.trocoPara)}.`
      : '';
  const observacao = pedido.observacao ? ` Observação do pedido: ${pedido.observacao}` : '';
  return `${pagamento}${troco}${observacao}`.slice(0, 500);
}

function pagamentoDaCorrida(
  forma: FormaDePagamento,
): CreateDeliveryPayload['customerPaymentMethod'] {
  if (eOnline(forma)) return 'PREPAID';
  if (forma === 'DINHEIRO') return 'CASH';
  if (forma === 'PIX_MAQUININHA') return 'PIX';
  return 'CARD';
}

/** A frase que a loja lê quando a corrida não nasceu ou não foi liberada. */
function motivoDaFalha(erro: unknown): string {
  if (erro instanceof ZodError) {
    return 'O endereço do pedido está incompleto para chamar o motoboy. Confira com o cliente.';
  }
  if (erro instanceof HttpException) {
    const resposta = erro.getResponse();
    const mensagem =
      typeof resposta === 'string'
        ? resposta
        : typeof (resposta as { message?: unknown }).message === 'string'
          ? (resposta as { message: string }).message
          : null;
    if (mensagem) return `Não deu para chamar o motoboy: ${mensagem}`.slice(0, 300);
  }
  return 'Não deu para chamar o motoboy agora. Tente de novo em instantes.';
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
  private readonly logger = new Logger(StoreOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogo: StoreCatalogService,
    private readonly operacao: StoreOperationService,
    private readonly entregas: DeliveriesService,
    private readonly avisos: StoreOrderNotificationsService,
    private readonly contasAsaas: StoreAsaasAccountService,
    private readonly asaas: StoreAsaasClient,
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
    // Pago online, o pedido nasce esperando o Pix: a loja só o vê depois de pago.
    const online = eOnline(pedido.pagamento);
    const inicio: { etapa: PedidoDaLoja['etapa']; historico: PassoDoPedido[] } = online
      ? {
          etapa: 'AGUARDANDO_PAGAMENTO',
          historico: [{ etapa: 'AGUARDANDO_PAGAMENTO', em: agora.toISOString() }],
        }
      : inicioDoPedido(modo, agora);
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

    const id = randomUUID();
    const pix = online
      ? await this.gerarPix(companyId, id, clienteId, {
          nome: pedido.cliente.nome,
          telefone: pedido.cliente.telefone,
          cpf: pedido.cpf ?? '',
          valor: reais(total),
          agora,
        })
      : null;

    const dados = {
      id,
      ...(pix ?? {}),
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

    let gravado: StoreOrder;
    try {
      gravado = await this.gravarComNumero(companyId, dados);
    } catch (erro) {
      // Sem pedido, a cobrança não pode ficar no Asaas esperando pagamento.
      if (pix) await this.apagarCobranca(companyId, pix.paymentProviderId);
      throw erro;
    }
    // O Pix ainda não foi pago: nada de corrida, nem de aviso à loja.
    if (online) return paraPedido(gravado);
    // Aceite automático: o pedido nasce aceito, e a corrida nasce com ele.
    if (gravado.stage === 'ACEITO') await this.chamarCorrida(companyId, gravado.id);
    const feito = paraPedido(gravado);
    await this.avisos.pedidoNovo(companyId, feito);
    return feito;
  }

  /**
   * "Já paguei": o cliente pede para conferir o Pix agora, em vez de esperar o
   * aviso do Asaas. O servidor pergunta ao Asaas — o navegador não decide que
   * pagou.
   */
  async conferirPagamento(slug: string, clienteId: string, id: string): Promise<PedidoDaLoja> {
    const companyId = await this.empresaDoLink(slug);
    const linha = await this.prisma.storeOrder.findFirst({
      where: { id, companyId, customerAuthId: clienteId },
    });
    if (!linha) {
      throw new NotFoundException({
        message: 'Pedido não encontrado.',
        code: 'STORE_ORDER_NOT_FOUND',
      });
    }
    if (linha.stage === 'AGUARDANDO_PAGAMENTO' && linha.paymentProviderId) {
      const conta = await this.contasAsaas.contaParaCobrar(companyId);
      const cobranca = conta
        ? await this.asaas.cobranca(conta.credencial, linha.paymentProviderId).catch(() => null)
        : null;
      if (cobranca && cobrancaPaga(cobranca.status)) await this.pagamentoRecebido(companyId, linha);
    }
    return paraPedido(await this.prisma.storeOrder.findFirstOrThrow({ where: { id } }));
  }

  /**
   * O aviso do Asaas, na conta da loja. O token é o que o MOTOboyCity criou para
   * esta conta; valor, cobrança e referência têm de bater com o pedido. Responde
   * 200 também ao que ignora — o Asaas para de mandar a fila inteira se um
   * aviso falhar.
   */
  async receberWebhook(
    companyId: string,
    token: string | undefined,
    envelope: AsaasWebhookEnvelope,
  ): Promise<{ received: true }> {
    if (!(await this.contasAsaas.webhookDaLoja(companyId, token))) {
      throw new UnauthorizedException('Webhook não autorizado.');
    }
    const pagamento = envelope.payment;
    if (!pagamento) return { received: true };
    const linha = await this.prisma.storeOrder.findFirst({
      where: { companyId, paymentProviderId: pagamento.id },
    });
    if (!linha) return { received: true };

    if (envelope.event === 'PAYMENT_RECEIVED' || envelope.event === 'PAYMENT_CONFIRMED') {
      const confere =
        cobrancaPaga(pagamento.status) &&
        pagamento.externalReference === linha.id &&
        Math.round(pagamento.value * 100) === centavos(Number(linha.total));
      if (!confere) {
        this.logger.warn(`Aviso do Asaas ${envelope.id} não confere com o pedido ${linha.id}.`);
        return { received: true };
      }
      await this.pagamentoRecebido(companyId, linha);
    } else if (envelope.event === 'PAYMENT_REFUNDED') {
      await this.prisma.storeOrder.updateMany({
        where: { id: linha.id, paymentStatus: { in: ['PAGO', 'ESTORNANDO', 'ESTORNO_FALHOU'] } },
        data: { paymentStatus: 'ESTORNADO', paymentIssue: null },
      });
    }
    return { received: true };
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
    const consulta = () =>
      this.prisma.storeOrder.findMany({
        where: { companyId: link.companyId, customerAuthId: clienteId },
        include: COM_A_CORRIDA,
        orderBy: { createdAt: 'desc' },
        take: 30,
      });
    const linhas = await this.acompanharCorridas(link.companyId, await consulta(), consulta);
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
    const consulta = () =>
      this.prisma.storeOrder.findMany({
        where: {
          companyId,
          // O Pix não pago nunca chegou à loja: nem esperando, nem depois de cair.
          stage: { not: 'AGUARDANDO_PAGAMENTO' },
          AND: [
            { OR: [{ paymentStatus: null }, { paymentStatus: { not: 'NAO_PAGO' } }] },
            {
              OR: [{ stage: { notIn: ['ENTREGUE', 'CANCELADO'] } }, { updatedAt: { gte: desde } }],
            },
          ],
        },
        include: COM_A_CORRIDA,
        orderBy: { createdAt: 'desc' },
        take: 300,
      });
    const linhas = await this.acompanharCorridas(companyId, await consulta(), consulta);
    return linhas.map(paraALoja);
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
    await this.mudar(companyId, id, (pedido, agora) => {
      if ((para === 'SAIU_PARA_ENTREGA' || para === 'ENTREGUE') && segueACorrida(pedido)) {
        throw new ConflictException({
          message:
            'Este pedido segue a corrida do MOTOboyCity: a saída e a entrega chegam do aplicativo do motoboy.',
          code: 'STORE_ORDER_FOLLOWS_RIDE',
        });
      }
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
    // Aceito, a corrida nasce agendada para quando o pedido fica pronto; pronto
    // antes da hora, ela é liberada agora. As duas não desfazem a etapa se
    // falharem: o motivo vira o aviso da corrida.
    if (para === 'ACEITO') await this.chamarCorrida(companyId, id);
    if (para === 'PRONTO') await this.liberarCorrida(user, companyId, id);
    return this.paraALojaPorId(companyId, id);
  }

  /**
   * A corrida sai antes do pedido, e só enquanto nenhum motoboy aceitou: com o
   * motoboy a caminho, cancelar é com a central — como a empresa no painel.
   */
  async cancelar(user: User, id: string, motivo: string): Promise<PedidoDaLoja> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    const linha = await this.prisma.storeOrder.findFirst({
      where: { id, companyId },
      include: COM_A_CORRIDA,
    });
    if (linha && corridaViva(linha.delivery)) {
      const pedido = paraPedido(linha);
      if (!podeCancelar(pedido.modalidade, pedido.etapa, pedido.entregaPor)) {
        throw new ConflictException({
          message: 'Este pedido já mudou de etapa. A tela vai se atualizar.',
          code: 'STORE_ORDER_STAGE_INVALID',
        });
      }
      const resultado = await this.entregas.cancelFromStoreOrder(
        companyId,
        linha.delivery.id,
        `Pedido #${linha.number} da loja online cancelado pela loja: ${motivo}`.slice(0, 500),
      );
      if (resultado === 'REVIEW') {
        throw new ConflictException({
          message:
            'O motoboy já aceitou a corrida deste pedido. Para cancelar, fale com a central.',
          code: 'STORE_ORDER_RIDE_ASSIGNED',
        });
      }
    }
    await this.mudar(companyId, id, (pedido, agora) =>
      this.dadosDoCancelamento(pedido, agora, { motivo, por: 'LOJA' }),
    );
    return this.paraALojaPorId(companyId, id);
  }

  /** O pedido do entregador da loja passa para o MOTOboyCity — num dia de aperto. */
  async chamarMotoboy(user: User, id: string): Promise<PedidoDaLoja> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    await this.mudar(companyId, id, (pedido) => {
      if (pedido.entregaPor === 'MOTOBOYCITY' && pedido.modalidade === 'ENTREGA') return null;
      if (!podeChamarMotoboyCity(pedido)) {
        throw new ConflictException({
          message: 'Este pedido não pode mais passar para o MOTOboyCity.',
          code: 'STORE_ORDER_STAGE_INVALID',
        });
      }
      return { courier: chamarMotoboyCity(pedido).entregaPor };
    });
    const pedido = await this.paraALojaPorId(companyId, id);
    await this.chamarCorrida(companyId, id, pedido.etapa === 'PRONTO');
    return this.paraALojaPorId(companyId, id);
  }

  /**
   * Chama o motoboy de novo, para o pedido cuja corrida não nasceu ou foi
   * cancelada pela central. Pronto, ela busca motoboy na hora; antes, nasce
   * agendada para quando ficar pronto.
   */
  async chamarDeNovo(user: User, id: string): Promise<PedidoDaLoja> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    const linha = await this.linhaDaLoja(companyId, id);
    const pedido = paraPedido(linha);
    if (!segueACorrida(pedido) || !ETAPAS_COM_CORRIDA.includes(pedido.etapa)) {
      throw new ConflictException({
        message: 'Este pedido não chama motoboy do MOTOboyCity agora.',
        code: 'STORE_ORDER_STAGE_INVALID',
      });
    }
    if (corridaViva(linha.delivery)) {
      throw new ConflictException({
        message: 'Este pedido já tem corrida.',
        code: 'STORE_ORDER_RIDE_EXISTS',
      });
    }
    await this.chamarCorrida(companyId, id, pedido.etapa === 'PRONTO');
    return this.paraALojaPorId(companyId, id);
  }

  /**
   * O pedido que o MOTOboyCity não vai levar — a corrida não nasceu, foi
   * cancelada, ou o motoboy não conseguiu entregar — passa ao entregador da
   * loja, que marca a saída e a entrega.
   */
  async entregarComALoja(user: User, id: string): Promise<PedidoDaLoja> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    const linha = await this.linhaDaLoja(companyId, id);
    if (corridaViva(linha.delivery)) {
      throw new ConflictException({
        message: 'Este pedido tem uma corrida andando. Para mudar, fale com a central.',
        code: 'STORE_ORDER_RIDE_EXISTS',
      });
    }
    const podeMudar: PedidoDaLoja['etapa'][] = [...ETAPAS_COM_CORRIDA, 'SAIU_PARA_ENTREGA'];
    await this.mudar(companyId, id, (pedido) => {
      if (!segueACorrida(pedido) || !podeMudar.includes(pedido.etapa)) {
        throw new ConflictException({
          message: 'Este pedido não pode mais passar para o entregador da loja.',
          code: 'STORE_ORDER_STAGE_INVALID',
        });
      }
      return { courier: 'LOJA', rideIssue: null };
    });
    return this.paraALojaPorId(companyId, id);
  }

  /* -------------------------------------------------------------------------
   * A corrida do MOTOboyCity
   * ----------------------------------------------------------------------- */

  /**
   * Chama o motoboy do pedido que o MOTOboyCity entrega. A corrida nasce
   * agendada para quando o pedido fica pronto (`prontoEm`) ou, se essa hora já
   * chegou — ou `agoraMesmo` —, buscando motoboy. Não derruba quem chamou: o
   * que der errado (fora do horário da central, sem preço, sem endereço de
   * coleta) vira o aviso da corrida, em Vendas.
   *
   * Idempotente: a chave da criação é o pedido e a tentativa, e repetir devolve
   * a corrida que já existe. Uma tentativa nova só começa quando a anterior foi
   * cancelada.
   */
  private async chamarCorrida(companyId: string, id: string, agoraMesmo = false): Promise<void> {
    const linha = await this.prisma.storeOrder.findFirst({
      where: { id, companyId },
      include: COM_A_CORRIDA,
    });
    if (!linha) return;
    const pedido = paraPedido(linha);
    if (!segueACorrida(pedido) || !ETAPAS_COM_CORRIDA.includes(pedido.etapa)) return;
    if (corridaViva(linha.delivery)) return;

    let tentativa = linha.rideAttempt;
    if (linha.delivery) {
      const { count } = await this.prisma.storeOrder.updateMany({
        where: { id, companyId, rideAttempt: tentativa },
        data: { rideAttempt: tentativa + 1 },
      });
      // Outra chamada ao mesmo tempo já começou a tentativa nova.
      if (count !== 1) return;
      tentativa += 1;
    }

    try {
      const payload = await this.pedidoDaCorrida(companyId, pedido, agoraMesmo);
      const corrida = await this.entregas.createFromStoreOrder(
        companyId,
        `${linha.id}:${tentativa}`,
        payload,
        `Pedido #${linha.number} da loja online.`,
      );
      await this.prisma.storeOrder.updateMany({
        where: { id, companyId },
        data: { deliveryId: corrida.id, rideIssue: null },
      });
    } catch (erro) {
      this.logger.warn(
        `Corrida do pedido ${id} não nasceu: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
      await this.prisma.storeOrder.updateMany({
        where: { id, companyId },
        data: { rideIssue: motivoDaFalha(erro) },
      });
    }
  }

  /**
   * Pronto antes da hora: a corrida agendada busca motoboy agora, pelo mesmo
   * "liberar" do painel — que respeita o horário da central. Sem corrida viva,
   * chama uma, já buscando.
   */
  private async liberarCorrida(user: User, companyId: string, id: string): Promise<void> {
    const linha = await this.prisma.storeOrder.findFirst({
      where: { id, companyId },
      include: COM_A_CORRIDA,
    });
    if (!linha || !segueACorrida(paraPedido(linha))) return;
    if (!corridaViva(linha.delivery)) return this.chamarCorrida(companyId, id, true);
    if (linha.delivery.status !== 'SCHEDULED') return;
    try {
      await this.entregas.releaseScheduled(user, linha.delivery.id);
      await this.prisma.storeOrder.updateMany({
        where: { id, companyId },
        data: { rideIssue: null },
      });
    } catch (erro) {
      await this.prisma.storeOrder.updateMany({
        where: { id, companyId },
        data: { rideIssue: motivoDaFalha(erro) },
      });
    }
  }

  /**
   * A corrida pedida do jeito do painel: o tipo de serviço da loja, o endereço
   * do cliente — sem CEP, o da loja, que é da mesma cidade (decisão do
   * usuário, 2026-09-26) —, e o dinheiro como no aiqfome: pago na entrega, o
   * motoboy volta à loja com ele ou com a maquininha.
   */
  private async pedidoDaCorrida(
    companyId: string,
    pedido: PedidoDaLoja,
    agoraMesmo: boolean,
  ): Promise<CreateDeliveryPayload> {
    const entrega = pedido.entrega;
    const [serviceTypeId, coleta] = await Promise.all([
      this.operacao.tipoDeServicoDaCorrida(companyId),
      this.prisma.companyAddress.findFirst({
        where: { companyId, isPrimary: true },
        select: { zip: true, state: true },
      }),
    ]);
    // Sem ele o motoboy não tem onde buscar — e o CEP de reserva também falta.
    if (!coleta) {
      throw new ConflictException(
        'A empresa ainda não tem um endereço de coleta. Cadastre na tela inicial do painel.',
      );
    }
    const pronto = prontoEm(pedido);
    const agendar = !agoraMesmo && pronto !== null && pronto.getTime() - Date.now() > 60_000;
    const referencia = [`Bairro ${entrega?.bairro ?? ''}`.trim(), entrega?.referencia]
      .filter(Boolean)
      .join(' · ');
    return createDeliverySchema.parse({
      serviceTypeId,
      destinationKnownAtCreation: true,
      dropoffAddress: {
        street: entrega?.rua ?? '',
        number: entrega?.numero ?? '',
        ...(entrega?.complemento ? { complement: entrega.complemento } : {}),
        city: entrega?.cidade ?? '',
        state: (entrega?.estado || coleta?.state || '').toUpperCase(),
        zip: entrega?.cep || coleta?.zip || '',
        referenceNote: referencia,
      },
      recipientName: pedido.cliente.nome,
      recipientPhone: pedido.cliente.telefone,
      externalOrderNumber: `Loja #${pedido.numero}`,
      driverNote: notaDoMotoboy(pedido),
      customerPaymentMethod: pagamentoDaCorrida(pedido.pagamento),
      requiresReturn: !eOnline(pedido.pagamento),
      ...(agendar && pronto ? { scheduledAt: pronto.toISOString() } : {}),
    });
  }

  /**
   * O pedido acompanha a corrida: a leitura da fila e dos pedidos do cliente
   * leva o pedido à etapa que a corrida já alcançou (coletada, saiu; entregue,
   * entregue), sem depender de a corrida avisar o pedido. Mudou algum, relê.
   */
  private async acompanharCorridas(
    companyId: string,
    linhas: LinhaDoPedido[],
    reler: () => Promise<LinhaDoPedido[]>,
  ): Promise<LinhaDoPedido[]> {
    const agora = new Date();
    let mudou = false;
    for (const linha of linhas) {
      if (!linha.delivery) continue;
      const situacao = situacaoDa(linha.delivery);
      const pedido = paraPedido(linha);
      if (pelaCorrida(pedido, situacao, agora) === pedido) continue;
      await this.mudar(companyId, linha.id, (atual, momento) => {
        const andado = pelaCorrida(atual, situacao, momento);
        return andado === atual
          ? null
          : { stage: andado.etapa, history: andado.historico as unknown as Prisma.InputJsonValue };
      }).catch(() => undefined);
      mudou = true;
    }
    return mudou ? reler() : linhas;
  }

  /* -------------------------------------------------------------------------
   * A varredura de minuto e os avisos com a página fechada
   * ----------------------------------------------------------------------- */

  /**
   * A cada minuto, sem ninguém olhar: o pedido que passou do prazo do aceite
   * cai, e o pedido acompanha a corrida que andou. Enquanto o aviso só existia
   * com a página aberta, bastava a leitura fazer isso — quem não olhava não
   * precisava saber. Com o aviso no celular, a mudança tem de acontecer na hora,
   * e não quando alguém abrir o painel.
   */
  async varrer(): Promise<void> {
    const agora = Date.now();
    const pixVencidos = await this.prisma.storeOrder.findMany({
      where: { stage: 'AGUARDANDO_PAGAMENTO', paymentDueAt: { lte: new Date(agora) } },
      select: { id: true, companyId: true },
      take: 200,
    });
    for (const { id, companyId } of pixVencidos) {
      await this.pixVencido(companyId, id).catch((erro: unknown) =>
        this.logger.warn(
          `Pix vencido ${id}: ${erro instanceof Error ? erro.message : String(erro)}`,
        ),
      );
    }
    const estornosParados = await this.prisma.storeOrder.findMany({
      where: {
        paymentStatus: 'ESTORNO_FALHOU',
        OR: [
          { paymentCheckedAt: null },
          { paymentCheckedAt: { lte: new Date(agora - INTERVALO_DO_ESTORNO_MS) } },
        ],
      },
      select: { id: true, companyId: true, cancelReason: true },
      take: 100,
    });
    for (const { id, companyId, cancelReason } of estornosParados) {
      await this.estornar(companyId, id, cancelReason ?? 'Pedido cancelado.');
    }

    const comPrazoVencido = await this.prisma.storeOrder.findMany({
      where: { stage: 'NOVO', acceptDeadline: { lte: new Date() } },
      select: { companyId: true },
      distinct: ['companyId'],
    });
    for (const { companyId } of comPrazoVencido) await this.cancelarVencidos(companyId);

    const andaram = await this.prisma.storeOrder.findMany({
      where: {
        stage: { in: ['ACEITO', 'EM_PREPARO', 'PRONTO', 'SAIU_PARA_ENTREGA'] },
        courier: 'MOTOBOYCITY',
        delivery: { status: { in: ['COLLECTED', 'DELIVERED', 'COMPLETED', 'FAILED'] } },
      },
      include: COM_A_CORRIDA,
      take: 500,
    });
    const porEmpresa = new Map<string, LinhaDoPedido[]>();
    for (const linha of andaram) {
      porEmpresa.set(linha.companyId, [...(porEmpresa.get(linha.companyId) ?? []), linha]);
    }
    for (const [companyId, linhas] of porEmpresa) {
      await this.acompanharCorridas(companyId, linhas, () => Promise.resolve(linhas));
    }
  }

  /** O painel deste aparelho passa a receber os avisos da loja com ele fechado. */
  async inscreverAvisosDaLoja(user: User, inscricao: WebPushSubscriptionPayload): Promise<void> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    await this.avisos.inscreverLoja(user, companyId, inscricao);
  }

  async cancelarAvisosDaLoja(user: User, endpoint: string): Promise<void> {
    const companyId = await this.catalogo.resolveCompanyId(user);
    await this.avisos.desinscrever(companyId, endpoint, { userId: user.id });
  }

  /** O cliente, neste aparelho, passa a receber os avisos dos pedidos dele nesta loja. */
  async inscreverAvisosDoCliente(
    slug: string,
    clienteId: string,
    inscricao: WebPushSubscriptionPayload,
  ): Promise<void> {
    const companyId = await this.empresaDoLink(slug);
    await this.avisos.inscreverCliente(companyId, clienteId, inscricao);
  }

  async cancelarAvisosDoCliente(slug: string, clienteId: string, endpoint: string): Promise<void> {
    const companyId = await this.empresaDoLink(slug);
    await this.avisos.desinscrever(companyId, endpoint, { customerAuthId: clienteId });
  }

  private async empresaDoLink(slug: string): Promise<string> {
    const link = await this.prisma.storeSlug.findUnique({
      where: { slug },
      select: { companyId: true },
    });
    if (!link) {
      throw new NotFoundException({ message: 'Loja não encontrada.', code: 'STORE_NOT_FOUND' });
    }
    return link.companyId;
  }

  /* -------------------------------------------------------------------------
   * O Pix, na conta Asaas da loja
   * ----------------------------------------------------------------------- */

  /**
   * A cobrança Pix do pedido, na conta da loja, antes de o pedido existir: se o
   * Asaas não gerar o Pix, o cliente fica sabendo na hora, e nenhum pedido fica
   * pela metade. O CPF vai ao Asaas (que o exige) e não fica no pedido.
   */
  private async gerarPix(
    companyId: string,
    pedidoId: string,
    clienteId: string,
    dados: { nome: string; telefone: string; cpf: string; valor: number; agora: Date },
  ) {
    const conta = (await this.contasAsaas.recebePix(companyId))
      ? await this.contasAsaas.contaParaCobrar(companyId)
      : null;
    if (!conta) {
      throw new ConflictException({
        message: 'Esta loja não está recebendo Pix pela página agora. Escolha pagar na entrega.',
        code: 'STORE_ORDER_PAYMENT_UNAVAILABLE',
      });
    }
    const loja = await this.prisma.storeSettings.findUnique({
      where: { companyId },
      select: { name: true },
    });
    let cobrancaId: string | null = null;
    try {
      const cliente = await this.asaas.clienteDoCpf(conta.credencial, {
        nome: dados.nome,
        cpf: dados.cpf,
        telefone: dados.telefone,
        referencia: clienteId,
      });
      const cobranca = await this.asaas.criarCobrancaPix(conta.credencial, {
        customer: cliente,
        value: dados.valor,
        dueDate: momentoNaLoja(dados.agora).data,
        description: `Pedido na ${loja?.name ?? 'loja online'}`.slice(0, 200),
        externalReference: pedidoId,
      });
      cobrancaId = cobranca.id;
      const qr = await this.asaas.qrCodePix(conta.credencial, cobranca.id);
      return {
        paymentStatus: 'AGUARDANDO' as StoreOrderPaymentStatus,
        paymentProviderId: cobranca.id,
        paymentEnvironment: conta.ambiente,
        pixPayload: qr.payload,
        pixQrCode: qr.encodedImage,
        paymentDueAt: new Date(dados.agora.getTime() + MINUTOS_DO_PIX * 60_000),
      };
    } catch (erro) {
      this.logger.warn(
        `Pix não gerado na conta da loja ${companyId}: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
      if (cobrancaId) await this.apagarCobranca(companyId, cobrancaId);
      throw new BadGatewayException({
        message: 'Não deu para gerar o Pix agora. Tente de novo, ou escolha pagar na entrega.',
        code: 'STORE_ORDER_PIX_FAILED',
      });
    }
  }

  /**
   * O Pix foi pago. Esperando, o pedido entra na loja (novo, ou aceito no
   * automático, com a corrida); já caído — pagou depois dos 15 minutos —, o
   * dinheiro volta inteiro na hora.
   */
  private async pagamentoRecebido(companyId: string, linha: StoreOrder): Promise<void> {
    if (linha.stage === 'AGUARDANDO_PAGAMENTO') {
      await this.confirmarPagamento(companyId, linha.id);
      return;
    }
    if (
      linha.stage === 'CANCELADO' &&
      (linha.paymentStatus === 'NAO_PAGO' || linha.paymentStatus === 'AGUARDANDO')
    ) {
      const { count } = await this.prisma.storeOrder.updateMany({
        where: { id: linha.id, paymentStatus: linha.paymentStatus },
        data: { paymentStatus: 'PAGO', paidAt: new Date() },
      });
      if (count === 1) {
        await this.estornar(companyId, linha.id, 'O Pix chegou depois de o pedido ser cancelado.');
      }
    }
  }

  private async confirmarPagamento(companyId: string, id: string): Promise<void> {
    const { recebimento } = await this.operacao.operacaoDaEmpresa(companyId);
    const depois = await this.mudar(companyId, id, (pedido, agora) => {
      if (pedido.etapa !== 'AGUARDANDO_PAGAMENTO') return null;
      const entrou = pagamentoConfirmado(pedido, recebimento.modo, agora);
      return {
        stage: entrou.etapa,
        history: entrou.historico as unknown as Prisma.InputJsonValue,
        acceptDeadline: prazoDoAceite(entrou, recebimento.prazoDoAceiteMin),
        paymentStatus: 'PAGO',
        paidAt: agora,
        pixPayload: null,
        pixQrCode: null,
      };
    });
    if (depois.etapa === 'ACEITO') await this.chamarCorrida(companyId, id);
  }

  /**
   * O Pix não pago em 15 minutos. Antes de cair, pergunta ao Asaas — o aviso
   * pode ter se perdido. Não pago: a cobrança é apagada lá, para não poder ser
   * paga depois, e o pedido cai sem a loja nunca tê-lo visto.
   */
  private async pixVencido(companyId: string, id: string): Promise<void> {
    const linha = await this.prisma.storeOrder.findFirst({ where: { id, companyId } });
    if (!linha || linha.stage !== 'AGUARDANDO_PAGAMENTO') return;
    const conta = await this.contasAsaas.contaParaCobrar(companyId);
    if (conta && linha.paymentProviderId) {
      const cobranca = await this.asaas
        .cobranca(conta.credencial, linha.paymentProviderId)
        .catch(() => null);
      if (cobranca && cobrancaPaga(cobranca.status)) {
        await this.pagamentoRecebido(companyId, linha);
        return;
      }
    }
    if (linha.paymentProviderId) await this.apagarCobranca(companyId, linha.paymentProviderId);
    await this.mudar(companyId, id, (pedido, momento) => {
      if (pedido.etapa !== 'AGUARDANDO_PAGAMENTO') return null;
      const cancelamento = this.dadosDoCancelamento(pedido, momento, {
        motivo: 'O Pix não foi pago a tempo',
        por: 'SISTEMA',
      });
      return cancelamento
        ? { ...cancelamento, paymentStatus: 'NAO_PAGO', pixPayload: null, pixQrCode: null }
        : null;
    });
  }

  /**
   * O estorno inteiro, pela conta da loja (decisão 18). Antes de pedir de
   * novo, pergunta ao Asaas se já não foi feito — o pedido anterior pode ter
   * saído sem resposta. Recusado, fica `ESTORNO_FALHOU`, com o motivo em Vendas,
   * e a varredura tenta de novo a cada 15 minutos.
   */
  private async estornar(companyId: string, id: string, motivo: string): Promise<void> {
    const { count } = await this.prisma.storeOrder.updateMany({
      where: { id, companyId, paymentStatus: { in: ['PAGO', 'ESTORNO_FALHOU'] } },
      data: { paymentStatus: 'ESTORNANDO', paymentCheckedAt: new Date() },
    });
    if (count !== 1) return;
    const linha = await this.prisma.storeOrder.findFirstOrThrow({ where: { id } });
    try {
      const conta = await this.contasAsaas.contaParaCobrar(companyId);
      if (
        !conta ||
        !linha.paymentProviderId ||
        (linha.paymentEnvironment && linha.paymentEnvironment !== conta.ambiente)
      ) {
        throw new Error('SEM_CONTA');
      }
      const atual = await this.asaas.cobranca(conta.credencial, linha.paymentProviderId);
      const jaPedido = atual.status.startsWith('REFUND');
      const cobranca = jaPedido
        ? atual
        : await this.asaas.estornar(conta.credencial, linha.paymentProviderId, motivo);
      await this.prisma.storeOrder.updateMany({
        where: { id },
        data: {
          paymentStatus: cobranca.status === 'REFUNDED' ? 'ESTORNADO' : 'ESTORNANDO',
          paymentIssue: null,
        },
      });
    } catch (erro) {
      this.logger.warn(
        `Estorno do pedido ${id} não saiu: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
      await this.prisma.storeOrder.updateMany({
        where: { id },
        data: { paymentStatus: 'ESTORNO_FALHOU', paymentIssue: motivoDoEstorno(erro) },
      });
    }
  }

  /** Sem lançar: a cobrança pode já ter sido paga, apagada ou vencida no Asaas. */
  private async apagarCobranca(companyId: string, cobrancaId: string): Promise<void> {
    const conta = await this.contasAsaas.contaParaCobrar(companyId).catch(() => null);
    if (!conta) return;
    await this.asaas.apagarCobranca(conta.credencial, cobrancaId).catch(() => undefined);
  }

  private async linhaDaLoja(companyId: string, id: string): Promise<LinhaDoPedido> {
    const linha = await this.prisma.storeOrder.findFirst({
      where: { id, companyId },
      include: COM_A_CORRIDA,
    });
    if (!linha) {
      throw new NotFoundException({
        message: 'Pedido não encontrado.',
        code: 'STORE_ORDER_NOT_FOUND',
      });
    }
    return linha;
  }

  private async paraALojaPorId(companyId: string, id: string): Promise<PedidoDaLoja> {
    return paraALoja(await this.linhaDaLoja(companyId, id));
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
        const depois = paraPedido(await this.prisma.storeOrder.findFirstOrThrow({ where: { id } }));
        // Quem fez a mudança é quem avisa: a outra aba, que perdeu a disputa,
        // não chega aqui, e o aviso não sai duas vezes.
        await this.avisos.etapaMudou(companyId, paraPedido(linha), depois);
        // Pago online e cancelado — pela loja, pelo prazo do aceite —: o
        // dinheiro volta inteiro, sozinho (decisão 18).
        if (depois.etapa === 'CANCELADO' && linha.paymentStatus === 'PAGO') {
          await this.estornar(companyId, id, depois.cancelamento?.motivo || 'Pedido cancelado.');
          return paraPedido(await this.prisma.storeOrder.findFirstOrThrow({ where: { id } }));
        }
        return depois;
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
