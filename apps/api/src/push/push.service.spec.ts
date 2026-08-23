import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from './push.service';

const send = jest.fn();

jest.mock('firebase-admin/app', () => ({
  cert: jest.fn(() => ({})),
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(() => ({ name: 'motoboycity-push' })),
  deleteApp: jest.fn(async () => undefined),
}));

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(() => ({ send })),
}));

/** Erro do FCM no formato que a biblioteca devolve. */
function erroFcm(code: string) {
  return Object.assign(new Error(code), { errorInfo: { code } });
}

describe('PushService', () => {
  let service: PushService;
  let prisma: {
    deviceToken: { findMany: jest.Mock; deleteMany: jest.Mock };
  };
  const ambienteOriginal = { ...process.env };

  async function montar(): Promise<PushService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PushService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const instancia = module.get(PushService);
    instancia.onModuleInit();
    return instancia;
  }

  beforeEach(() => {
    send.mockReset().mockResolvedValue('ok');
    prisma = {
      deviceToken: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
    };
    process.env['FIREBASE_PROJECT_ID'] = 'projeto-teste';
    process.env['FIREBASE_CLIENT_EMAIL'] = 'push@projeto-teste.iam.gserviceaccount.com';
    process.env['FIREBASE_PRIVATE_KEY'] = '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END-----';
  });

  afterEach(() => {
    process.env = { ...ambienteOriginal };
  });

  describe('sem credencial', () => {
    it('fica inerte em vez de derrubar a API', async () => {
      // Um piloto pode comecar sem Firebase. Falhar na subida por causa de uma
      // variavel de ambiente transformaria recurso ausente em sistema fora do ar.
      delete process.env['FIREBASE_PROJECT_ID'];
      service = await montar();

      expect(service.enabled).toBe(false);
      await expect(service.sendToDriver('driver-1', { title: 'a', body: 'b' })).resolves.toBe(0);
      expect(prisma.deviceToken.findMany).not.toHaveBeenCalled();
    });

    it('credencial pela metade também desliga', async () => {
      // Meia credencial e pior que nenhuma: falharia so no primeiro envio, que
      // acontece no meio de um despacho real.
      delete process.env['FIREBASE_PRIVATE_KEY'];
      service = await montar();

      expect(service.enabled).toBe(false);
    });
  });

  describe('envio', () => {
    it('manda para todos os aparelhos do motoboy', async () => {
      // Trocou de celular e nao desinstalou o antigo: nao da para saber qual
      // esta no bolso dele agora.
      prisma.deviceToken.findMany.mockResolvedValue([{ token: 't1' }, { token: 't2' }]);
      service = await montar();

      await expect(service.sendToDriver('driver-1', { title: 'a', body: 'b' })).resolves.toBe(2);
      expect(send).toHaveBeenCalledTimes(2);
    });

    it('não consulta o Firebase quando o motoboy não tem aparelho', async () => {
      service = await montar();

      await expect(service.sendToDriver('driver-1', { title: 'a', body: 'b' })).resolves.toBe(0);
      expect(send).not.toHaveBeenCalled();
    });

    it('oferta vai SÓ COM DADOS, para o serviço nativo abrir a tela cheia', async () => {
      /**
       * E a diferenca entre a oferta aparecer como faixa no topo ou tomar a tela
       * inteira. Com bloco `notification`, o Android desenha sozinho e o
       * aplicativo nunca e chamado — e e so de dentro dele que da para pedir
       * tela cheia.
       */
      prisma.deviceToken.findMany.mockResolvedValue([{ token: 't1' }]);
      service = await montar();

      await service.sendToDriver('driver-1', {
        kind: 'offer',
        title: 'Nova entrega',
        body: 'Loja X',
        data: { type: 'offer', offerId: 'o1' },
      });

      const enviado = send.mock.calls[0]?.[0];
      expect(enviado.notification).toBeUndefined();
      // Titulo e corpo viajam nos dados, porque e o servico nativo que desenha.
      expect(enviado.data).toEqual({
        type: 'offer',
        offerId: 'o1',
        title: 'Nova entrega',
        body: 'Loja X',
      });
      expect(enviado.android.priority).toBe('high');
      // Oferta e evento vivo: guardar uma que expirou para entregar depois so
      // faria o motoboy abrir o app e nao encontrar nada.
      expect(enviado.android.ttl).toBe(0);
    });

    it('aviso comum mantém o bloco de notificação, que é mais garantido', async () => {
      // Nenhum deles precisa de tela cheia, e ali o que importa e a entrega
      // acontecer mesmo com o aplicativo encerrado.
      prisma.deviceToken.findMany.mockResolvedValue([{ token: 't1' }]);
      service = await montar();

      await service.sendToDriver('driver-1', { title: 'a', body: 'b' });

      const enviado = send.mock.calls[0]?.[0];
      expect(enviado.notification).toEqual({ title: 'a', body: 'b' });
      expect(enviado.android.notification.channelId).toBe('avisos');
      expect(enviado.android.ttl).toBeUndefined();
    });
  });

  describe('limpeza de token morto', () => {
    it('apaga token que o FCM diz não existir mais', async () => {
      // O FCM so avisa na hora de enviar. Sem esta limpeza, a tabela cresce com
      // aparelhos desinstalados e todo envio arrasta erro que nao e erro.
      prisma.deviceToken.findMany.mockResolvedValue([{ token: 'morto' }, { token: 'vivo' }]);
      send.mockImplementation(async (payload: { token: string }) => {
        if (payload.token === 'morto') {
          throw erroFcm('messaging/registration-token-not-registered');
        }
        return 'ok';
      });
      service = await montar();

      await expect(service.sendToDriver('driver-1', { title: 'a', body: 'b' })).resolves.toBe(1);
      expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({
        where: { token: { in: ['morto'] } },
      });
    });

    it('falha de rede não apaga o token', async () => {
      // Firebase fora do ar nao e aparelho desinstalado. Apagar aqui deixaria o
      // motoboy sem push ate ele reinstalar o aplicativo.
      prisma.deviceToken.findMany.mockResolvedValue([{ token: 't1' }]);
      send.mockRejectedValue(erroFcm('messaging/server-unavailable'));
      service = await montar();

      await expect(service.sendToDriver('driver-1', { title: 'a', body: 'b' })).resolves.toBe(0);
      expect(prisma.deviceToken.deleteMany).not.toHaveBeenCalled();
    });
  });
});
