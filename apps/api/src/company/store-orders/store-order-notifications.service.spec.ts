import { Test, type TestingModule } from '@nestjs/testing';
import type { PedidoDaLoja } from '@motoboycity/types';
import { PrismaService } from '../../prisma/prisma.service';
import { WebPushService } from '../../web-push/web-push.service';
import {
  OPERACAO_INICIAL,
  StoreOperationService,
} from '../store-operation/store-operation.service';
import { StoreOrderNotificationsService } from './store-order-notifications.service';

/**
 * Quem recebe cada aviso com a página fechada: a loja, o pedido novo e o
 * cancelado por outra ponta; o cliente, as etapas que a loja deixou ligadas,
 * e sempre o cancelamento.
 */

const EMPRESA = 'empresa-1';
const LOJA = [
  { id: 'i1', endpoint: 'https://fcm.googleapis.com/fcm/send/loja', p256dh: 'p', auth: 'a' },
];
const CLIENTE = [
  { id: 'i2', endpoint: 'https://fcm.googleapis.com/fcm/send/cliente', p256dh: 'p', auth: 'a' },
];

function pedido(mudancas: Partial<PedidoDaLoja> = {}): PedidoDaLoja {
  return {
    id: 'pedido-1',
    numero: 42,
    criadoEm: '2026-09-26T15:00:00.000Z',
    modalidade: 'ENTREGA',
    etapa: 'NOVO',
    historico: [{ etapa: 'NOVO', em: '2026-09-26T15:00:00.000Z' }],
    janela: null,
    minutosDePreparo: 20,
    minutosDeEntrega: 15,
    cancelamento: null,
    entregaPor: 'MOTOBOYCITY',
    cliente: { nome: 'Ana', telefone: '33999887766' },
    itens: [],
    subtotal: 40,
    taxaDeEntrega: 5,
    total: 45,
    pagamento: 'DINHEIRO',
    trocoPara: null,
    entrega: null,
    observacao: null,
    corrida: null,
    avisoDaCorrida: null,
    ...mudancas,
  };
}

describe('StoreOrderNotificationsService', () => {
  let service: StoreOrderNotificationsService;
  let webPush: { disponivel: jest.Mock; enviar: jest.Mock };
  let operacao: typeof OPERACAO_INICIAL;

  beforeEach(async () => {
    operacao = structuredClone(OPERACAO_INICIAL);
    webPush = { disponivel: jest.fn().mockReturnValue(true), enviar: jest.fn() };
    const prisma = {
      webPushSubscription: {
        findMany: jest
          .fn()
          .mockImplementation(({ where }: { where: { audience: string } }) =>
            Promise.resolve(where.audience === 'LOJA' ? LOJA : CLIENTE),
          ),
      },
      storeOrder: { findUnique: jest.fn().mockResolvedValue({ customerAuthId: 'uid-1' }) },
      storeSettings: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Açaí do Zé', slug: 'acai' }),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreOrderNotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: WebPushService, useValue: webPush },
        {
          provide: StoreOperationService,
          useValue: { operacaoDaEmpresa: jest.fn().mockImplementation(() => operacao) },
        },
      ],
    }).compile();
    service = module.get(StoreOrderNotificationsService);
  });

  it('pedido novo: a loja recebe o resumo, na etiqueta do painel; o cliente, o recebido', async () => {
    await service.pedidoNovo(EMPRESA, pedido());

    expect(webPush.enviar).toHaveBeenCalledWith(LOJA, {
      titulo: 'Novo pedido',
      corpo: '#42 · Ana · R$ 45,00 · entrega',
      url: '/loja/vendas',
      etiqueta: 'venda-42',
    });
    expect(webPush.enviar).toHaveBeenCalledWith(CLIENTE, {
      titulo: 'Açaí do Zé',
      corpo: 'Recebemos seu pedido #42.',
      url: '/pedir/acai/pedidos',
      etiqueta: 'pedido-42',
    });
  });

  it('o que a loja desligou não sai — menos o cancelamento para o cliente', async () => {
    operacao.notificacoes.lojista.NOVO_PEDIDO.push = false;
    operacao.notificacoes.cliente.RECEBIDO = false;
    operacao.notificacoes.cliente.CANCELADO = false;

    await service.pedidoNovo(EMPRESA, pedido());
    expect(webPush.enviar).not.toHaveBeenCalled();

    await service.etapaMudou(
      EMPRESA,
      pedido(),
      pedido({ etapa: 'CANCELADO', cancelamento: { motivo: 'Item em falta', por: 'LOJA' } }),
    );
    // A loja cancelou: ela não é avisada do que fez; o cliente, sempre.
    expect(webPush.enviar).toHaveBeenCalledTimes(1);
    expect(webPush.enviar).toHaveBeenCalledWith(
      CLIENTE,
      expect.objectContaining({ corpo: 'Seu pedido #42 foi cancelado: Item em falta.' }),
    );
  });

  it('cancelado pelo sistema avisa a loja também; mudar sem mudar de etapa não avisa', async () => {
    await service.etapaMudou(
      EMPRESA,
      pedido(),
      pedido({ etapa: 'CANCELADO', cancelamento: { motivo: 'Prazo', por: 'SISTEMA' } }),
    );
    expect(webPush.enviar).toHaveBeenCalledWith(
      LOJA,
      expect.objectContaining({ titulo: 'Pedido cancelado' }),
    );

    webPush.enviar.mockClear();
    await service.etapaMudou(EMPRESA, pedido(), pedido({ entregaPor: 'LOJA' }));
    expect(webPush.enviar).not.toHaveBeenCalled();
  });

  it('sem as chaves, nada é consultado nem enviado', async () => {
    webPush.disponivel.mockReturnValue(false);
    await service.pedidoNovo(EMPRESA, pedido());
    expect(webPush.enviar).not.toHaveBeenCalled();
  });
});
