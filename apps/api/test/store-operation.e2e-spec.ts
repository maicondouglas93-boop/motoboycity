import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { OperacaoDaLoja, PublicStoreLookup, StoreSettings } from '@motoboycity/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Como a loja funciona, contra o banco de verdade: cada bloco numa coluna, um
 * sem desfazer o outro; as regras que a entrada recusa; e o que a página do
 * cliente recebe — o horário, o pagamento, os bairros e a identidade, sem os
 * avisos da loja.
 */

const suffix = String(Date.now()).slice(-8);
const password = 'senhaSegura123';
const empresa = {
  email: `operacao.${suffix}@example.com`,
  document: `501${suffix}`.slice(0, 11),
  tradeName: 'Operacao E2E',
};
const link = `operacao-${suffix}`;

const semana = [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
  dia,
  faixas: dia === 0 ? [] : [{ abre: '11:00', fecha: '14:00' }],
}));

describe('Operação da loja online (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token = '';
  let regiaoCriada: string | null = null;

  const comoEmpresa = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    prisma = module.get(PrismaService);
    await app.init();

    if (!(await prisma.region.findFirst({ where: { active: true } }))) {
      regiaoCriada = (await prisma.region.create({ data: { name: `Região E2E ${suffix}` } })).id;
    }
    await request(app.getHttpServer())
      .post('/auth/register/company')
      .send({
        name: empresa.tradeName,
        email: empresa.email,
        phone: '33999887766',
        document: empresa.document,
        legalName: `${empresa.tradeName} LTDA`,
        tradeName: empresa.tradeName,
        password,
      });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: empresa.email, password });
    token = login.body.accessToken as string;
  });

  afterAll(async () => {
    await prisma.companyTeamMember.deleteMany({ where: { user: { email: empresa.email } } });
    // A operação, a loja e o link saem junto com a empresa, em cascata.
    await prisma.company.deleteMany({ where: { document: empresa.document } });
    await prisma.user.deleteMany({ where: { email: empresa.email } });
    if (regiaoCriada) await prisma.region.delete({ where: { id: regiaoCriada } });
    await app.close();
  });

  it('cada bloco grava sozinho, e a página do cliente recebe o horário', async () => {
    const servidor = app.getHttpServer();

    const inicial = await request(servidor)
      .get('/company/store/operation')
      .set(comoEmpresa())
      .expect(200);
    const operacao = inicial.body as OperacaoDaLoja;
    expect(operacao.funcionamento.semana.every((dia) => dia.faixas.length === 0)).toBe(true);

    // Pausa primeiro, horário depois: salvar o horário não desfaz a pausa.
    const ate = new Date(Date.now() + 30 * 60_000).toISOString();
    await request(servidor)
      .put('/company/store/operation/status')
      .set(comoEmpresa())
      .send({ ajuste: { estado: 'PAUSADA', ate } })
      .expect(200);
    const comHorario = await request(servidor)
      .put('/company/store/operation/schedule')
      .set(comoEmpresa())
      .send({ semana, excecoes: [], mensagemFechada: 'Voltamos às 11h' })
      .expect(200);
    expect((comHorario.body as OperacaoDaLoja).funcionamento).toMatchObject({
      mensagemFechada: 'Voltamos às 11h',
      ajuste: { estado: 'PAUSADA', ate },
    });

    const { recebimento, entrega, agendamento } = operacao;
    const tipos = await request(servidor)
      .put('/company/store/operation/order-types')
      .set(comoEmpresa())
      .send({
        recebimento: { ...recebimento, modo: 'MANUAL' },
        entrega: { ...entrega, quemEntrega: 'LOJA' },
        retirada: { ativa: true, endereco: null, instrucoes: 'No balcão', agendamento: false },
        agendamento,
      })
      .expect(200);
    expect((tipos.body as OperacaoDaLoja).funcionamento.ajuste?.estado).toBe('PAUSADA');
    expect((tipos.body as OperacaoDaLoja).entrega.quemEntrega).toBe('LOJA');

    // O que a entrada recusa.
    await request(servidor)
      .put('/company/store/operation/status')
      .set(comoEmpresa())
      .send({ ajuste: { estado: 'ABERTA', ate: null } })
      .expect(400);
    await request(servidor)
      .put('/company/store/operation/notifications')
      .set(comoEmpresa())
      .send({
        ...operacao.notificacoes,
        cliente: { ...operacao.notificacoes.cliente, CANCELADO: false },
      })
      .expect(400);

    // Pagamento: online depende da conta Asaas, que ainda não existe.
    await request(servidor)
      .put('/company/store/operation/payments')
      .set(comoEmpresa())
      .send({ pagamentos: ['DINHEIRO', 'PIX_ONLINE'] })
      .expect(400);
    await request(servidor)
      .put('/company/store/operation/payments')
      .set(comoEmpresa())
      .send({ pagamentos: ['DINHEIRO', 'PIX_MAQUININHA'] })
      .expect(200);

    // Bairros: o mesmo nome duas vezes, com acento ou sem, é recusado.
    await request(servidor)
      .put('/company/store/operation/delivery-areas')
      .set(comoEmpresa())
      .send({
        bairros: [
          { id: 'b1', nome: 'São José', taxa: 5 },
          { id: 'b2', nome: 'sao jose', taxa: 7 },
        ],
      })
      .expect(400);
    const comBairros = await request(servidor)
      .put('/company/store/operation/delivery-areas')
      .set(comoEmpresa())
      .send({
        bairros: [
          { id: 'b1', nome: 'Centro', taxa: 6 },
          { id: 'b2', nome: 'Vila Nova', taxa: 8.5 },
        ],
      })
      .expect(200);
    // Os outros blocos seguem como estavam.
    expect((comBairros.body as OperacaoDaLoja).pagamentos).toEqual(['DINHEIRO', 'PIX_MAQUININHA']);
    expect((comBairros.body as OperacaoDaLoja).funcionamento.ajuste?.estado).toBe('PAUSADA');

    // A identidade exige a loja: sem link, não há página para vestir.
    const cores = { theme: 'ESCURO', brandColor: '#FBBF24', actionColor: '#22c55e' };
    await request(servidor)
      .put('/company/store/settings/identity')
      .set(comoEmpresa())
      .send(cores)
      .expect(409);

    // A página do cliente: loja com link e empresa ativa.
    await request(servidor)
      .put('/company/store/settings/link')
      .set(comoEmpresa())
      .send({ slug: link, name: 'Operação' })
      .expect(200);

    // Amarelo sobre o fundo claro some: recusado, com a mesma régua do painel.
    await request(servidor)
      .put('/company/store/settings/identity')
      .set(comoEmpresa())
      .send({ ...cores, theme: 'CLARO' })
      .expect(400);
    const vestida = await request(servidor)
      .put('/company/store/settings/identity')
      .set(comoEmpresa())
      .send(cores)
      .expect(200);
    expect((vestida.body as StoreSettings).identity).toEqual({
      theme: 'ESCURO',
      brandColor: '#fbbf24',
      actionColor: '#22c55e',
      logoUrl: null,
    });
    await prisma.company.update({
      where: { document: empresa.document },
      data: { status: 'ACTIVE' },
    });
    const publica = await request(servidor).get(`/public/stores/${link}`).expect(200);
    const loja = publica.body as Extract<PublicStoreLookup, { kind: 'store' }>;
    expect(loja.store.operacao.funcionamento.mensagemFechada).toBe('Voltamos às 11h');
    expect(loja.store.operacao.retirada.ativa).toBe(true);
    expect(loja.store.operacao).not.toHaveProperty('notificacoes');
    expect(loja.store.operacao.pagamentos).toEqual(['DINHEIRO', 'PIX_MAQUININHA']);
    expect(loja.store.operacao.bairros.map((bairro) => bairro.nome)).toEqual([
      'Centro',
      'Vila Nova',
    ]);
    expect(loja.store.identity).toMatchObject({ theme: 'ESCURO', brandColor: '#fbbf24' });
  });
});
