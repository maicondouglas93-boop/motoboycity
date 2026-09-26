import { PrismaService } from '../prisma/prisma.service';
import {
  WebPushService,
  readWebPushCredentials,
  type InscricaoDePush,
  type WebPushCredentials,
} from './web-push.service';

/** O envio de verdade trocado por um que responde o que o teste mandar. */
class WebPushDeTeste extends WebPushService {
  respostas = new Map<string, number>();
  enviados: string[] = [];

  protected override enviarUm(inscricao: InscricaoDePush, payload: string): Promise<void> {
    this.enviados.push(payload);
    const status = this.respostas.get(inscricao.id);
    return status
      ? Promise.reject(Object.assign(new Error('recusado'), { statusCode: status }))
      : Promise.resolve();
  }
}

const CHAVES = {
  WEB_PUSH_PUBLIC_KEY: 'publica',
  WEB_PUSH_PRIVATE_KEY: 'privada',
  WEB_PUSH_SUBJECT: 'mailto:contato@example.com',
};

function inscricao(id: string): InscricaoDePush {
  return { id, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, p256dh: 'p', auth: 'a' };
}

describe('WebPushService', () => {
  const ambiente = { ...process.env };
  let prisma: { webPushSubscription: { deleteMany: jest.Mock } };

  beforeEach(() => {
    prisma = { webPushSubscription: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) } };
  });

  afterEach(() => {
    process.env = { ...ambiente };
  });

  it('só liga com as três variáveis', () => {
    expect(readWebPushCredentials({})).toBeNull();
    expect(readWebPushCredentials({ ...CHAVES, WEB_PUSH_SUBJECT: ' ' })).toBeNull();
    expect(readWebPushCredentials(CHAVES)).toEqual<WebPushCredentials>({
      publicKey: 'publica',
      privateKey: 'privada',
      subject: 'mailto:contato@example.com',
    });
  });

  it('sem as chaves, não envia e não expõe chave', async () => {
    process.env = {
      ...ambiente,
      WEB_PUSH_PUBLIC_KEY: '',
      WEB_PUSH_PRIVATE_KEY: '',
      WEB_PUSH_SUBJECT: '',
    };
    const servico = new WebPushDeTeste(prisma as unknown as PrismaService);
    servico.onModuleInit();
    await servico.enviar([inscricao('a')], { titulo: 't', corpo: 'c', url: '/', etiqueta: 'e' });
    expect(servico.disponivel()).toBe(false);
    expect(servico.chavePublica()).toBeNull();
    expect(servico.enviados).toHaveLength(0);
  });

  it('manda a todos; o aparelho sumido (404/410) sai, e o erro de outro tipo não', async () => {
    process.env = { ...ambiente, ...CHAVES };
    const servico = new WebPushDeTeste(prisma as unknown as PrismaService);
    servico.onModuleInit();
    servico.respostas.set('sumiu', 410);
    servico.respostas.set('falhou', 500);

    await servico.enviar([inscricao('ok'), inscricao('sumiu'), inscricao('falhou')], {
      titulo: 'Novo pedido',
      corpo: '#42',
      url: '/loja/vendas',
      etiqueta: 'venda-42',
    });

    expect(servico.chavePublica()).toBe('publica');
    expect(servico.enviados).toHaveLength(3);
    expect(JSON.parse(servico.enviados[0]!)).toEqual({
      titulo: 'Novo pedido',
      corpo: '#42',
      url: '/loja/vendas',
      etiqueta: 'venda-42',
    });
    expect(prisma.webPushSubscription.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.webPushSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: 'sumiu' } });
  });
});
