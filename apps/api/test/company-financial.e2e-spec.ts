import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

const sufixo = Date.now();
const password = 'senhaSegura123';

const emailLojaA = `teste.fin.lojaA.${sufixo}@example.com`;
const documentoA = `7711223${String(sufixo).slice(-4)}`;
const emailLojaB = `teste.fin.lojaB.${sufixo}@example.com`;
const documentoB = `7722334${String(sufixo).slice(-4)}`;
const emailMotoboy = `teste.fin.driver.${sufixo}@example.com`;
const cpfMotoboy = `777${String(sufixo).slice(-8)}`;

/**
 * O financeiro da loja, do lado de fora.
 *
 * O teste que importa aqui é o de isolamento: duas empresas de verdade, e a
 * garantia de que uma não enxerga o dinheiro da outra. Um vazamento desses
 * seria silencioso — a tela funcionaria normalmente, mostrando os números
 * errados.
 */
describe('CompanyFinancialController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokenLojaA: string;
  let tokenLojaB: string;
  let tokenMotoboy: string;
  let empresaBId: string;
  let faturaDaLojaBId: string;

  async function registrarLoja(nome: string, email: string, documento: string) {
    await request(app.getHttpServer()).post('/auth/register/company').send({
      name: nome,
      email,
      phone: '33999887766',
      document: documento,
      legalName: `${nome} LTDA`,
      tradeName: nome,
      password,
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });
    return login.body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    await app.init();

    tokenLojaA = await registrarLoja('Loja A Financeiro E2E', emailLojaA, documentoA);
    tokenLojaB = await registrarLoja('Loja B Financeiro E2E', emailLojaB, documentoB);

    await request(app.getHttpServer()).post('/auth/register/driver').send({
      name: 'Driver Financeiro E2E',
      email: emailMotoboy,
      phone: '33999887788',
      cpf: cpfMotoboy,
      birthDate: '1990-05-20',
      pixKey: emailMotoboy,
      pixKeyType: 'EMAIL',
      hasCnpj: false,
      password,
    });
    const loginMotoboy = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: emailMotoboy, password });
    tokenMotoboy = loginMotoboy.body.accessToken;

    const empresaB = await prisma.company.findFirstOrThrow({ where: { document: documentoB } });
    empresaBId = empresaB.id;

    // Uma fatura que pertence SÓ à loja B. É o alvo da tentativa de leitura
    // cruzada mais abaixo.
    const fatura = await prisma.invoice.create({
      data: {
        companyId: empresaBId,
        number: `FAT-E2E-${sufixo}`,
        status: 'PENDING',
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        totalValue: 250,
        driverValueSum: 200,
        platformValueSum: 50,
      },
    });
    faturaDaLojaBId = fatura.id;
  });

  afterAll(async () => {
    await prisma.invoice.deleteMany({ where: { company: { document: { in: [documentoA, documentoB] } } } });
    await prisma.companyTeamMember.deleteMany({
      where: { user: { email: { in: [emailLojaA, emailLojaB] } } },
    });
    await prisma.company.deleteMany({ where: { document: { in: [documentoA, documentoB] } } });
    await prisma.driver.deleteMany({ where: { user: { email: emailMotoboy } } });
    await prisma.user.deleteMany({
      where: { email: { in: [emailLojaA, emailLojaB, emailMotoboy] } },
    });
    await app.close();
  });

  describe('GET /company/financial/position', () => {
    it('rejeita sem token com 401', async () => {
      await request(app.getHttpServer()).get('/company/financial/position').expect(401);
    });

    it('rejeita motoboy com 403', async () => {
      await request(app.getHttpServer())
        .get('/company/financial/position')
        .set('Authorization', `Bearer ${tokenMotoboy}`)
        .expect(403);
    });

    it('loja nova vê tudo zerado, sem NaN nem tela quebrada', async () => {
      const resposta = await request(app.getHttpServer())
        .get('/company/financial/position')
        .set('Authorization', `Bearer ${tokenLojaA}`)
        .expect(200);

      expect(resposta.body.notDue).toEqual({ count: 0, value: 0 });
      expect(resposta.body.overdue).toEqual({ count: 0, value: 0, maxOverdueDays: 0 });
      expect(resposta.body.unbilled).toEqual({ count: 0, value: 0 });
      expect(resposta.body.totalOpen).toBe(0);
      expect(resposta.body.nextClosingDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('a fatura da loja B NÃO aparece na posição da loja A', async () => {
      // A regra nº 1 deste painel. A fatura existe, vale R$ 250,00 e está
      // pendente — e a loja A tem que continuar vendo zero.
      const lojaA = await request(app.getHttpServer())
        .get('/company/financial/position')
        .set('Authorization', `Bearer ${tokenLojaA}`)
        .expect(200);
      const lojaB = await request(app.getHttpServer())
        .get('/company/financial/position')
        .set('Authorization', `Bearer ${tokenLojaB}`)
        .expect(200);

      expect(lojaA.body.notDue).toEqual({ count: 0, value: 0 });
      expect(lojaB.body.notDue).toEqual({ count: 1, value: 250 });
      expect(lojaB.body.totalOpen).toBe(250);
    });

    it('ignora companyId enviado na query', async () => {
      // Se algum dia alguém aceitar o parâmetro, este teste quebra antes de
      // virar vazamento.
      const resposta = await request(app.getHttpServer())
        .get(`/company/financial/position?companyId=${empresaBId}`)
        .set('Authorization', `Bearer ${tokenLojaA}`)
        .expect(200);

      expect(resposta.body.notDue).toEqual({ count: 0, value: 0 });
      expect(resposta.body.totalOpen).toBe(0);
    });
  });

  describe('GET /company/financial/unbilled', () => {
    it('rejeita sem token com 401', async () => {
      await request(app.getHttpServer()).get('/company/financial/unbilled').expect(401);
    });

    it('rejeita motoboy com 403', async () => {
      await request(app.getHttpServer())
        .get('/company/financial/unbilled')
        .set('Authorization', `Bearer ${tokenMotoboy}`)
        .expect(403);
    });

    it('loja sem pedidos recebe lista vazia com total zero', async () => {
      const resposta = await request(app.getHttpServer())
        .get('/company/financial/unbilled')
        .set('Authorization', `Bearer ${tokenLojaA}`)
        .expect(200);

      expect(resposta.body.items).toEqual([]);
      expect(resposta.body.count).toBe(0);
      expect(resposta.body.total).toBe(0);
      expect(resposta.body.closingDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('GET /company/invoices/:id', () => {
    it('a loja A não lê a fatura da loja B', async () => {
      const resposta = await request(app.getHttpServer())
        .get(`/company/invoices/${faturaDaLojaBId}`)
        .set('Authorization', `Bearer ${tokenLojaA}`);

      // 403 ou 404: o que não pode é 200. Fatura de outra loja não é assunto
      // desta loja, e qualquer um dos dois códigos diz isso.
      expect([403, 404]).toContain(resposta.status);
    });

    it('a loja B lê a própria fatura', async () => {
      const resposta = await request(app.getHttpServer())
        .get(`/company/invoices/${faturaDaLojaBId}`)
        .set('Authorization', `Bearer ${tokenLojaB}`)
        .expect(200);

      expect(resposta.body.totalValue).toBe(250);
    });
  });

  describe('GET /company/financial/summary', () => {
    it('rejeita motoboy com 403', async () => {
      await request(app.getHttpServer())
        .get('/company/financial/summary?from=2026-08-01&to=2026-08-24')
        .set('Authorization', `Bearer ${tokenMotoboy}`)
        .expect(403);
    });

    it('recusa período invertido com 400', async () => {
      await request(app.getHttpServer())
        .get('/company/financial/summary?from=2026-08-24&to=2026-08-01')
        .set('Authorization', `Bearer ${tokenLojaA}`)
        .expect(400);
    });

    it('recusa intervalo maior que 366 dias', async () => {
      // Sem o limite, uma consulta acidental varreria todo o histórico da loja
      // — que é o problema que este endpoint veio resolver.
      await request(app.getHttpServer())
        .get('/company/financial/summary?from=2024-01-01&to=2026-08-24')
        .set('Authorization', `Bearer ${tokenLojaA}`)
        .expect(400);
    });

    it('loja sem pedidos recebe zeros, sem NaN', async () => {
      const resposta = await request(app.getHttpServer())
        .get('/company/financial/summary?from=2026-08-01&to=2026-08-24')
        .set('Authorization', `Bearer ${tokenLojaA}`)
        .expect(200);

      expect(resposta.body.current.count).toBe(0);
      expect(resposta.body.current.averageTicket).toBe(0);
      expect(resposta.body.previous).toBeNull();
      expect(resposta.body.topServiceType).toBeNull();
      expect(resposta.body.daily).toEqual([]);
    });
  });

  describe('GET /company/financial/export', () => {
    it('rejeita motoboy com 403', async () => {
      await request(app.getHttpServer())
        .get('/company/financial/export?from=2026-08-01&to=2026-08-24')
        .set('Authorization', `Bearer ${tokenMotoboy}`)
        .expect(403);
    });

    it('devolve CSV com separador ponto e vírgula e nome de arquivo', async () => {
      const resposta = await request(app.getHttpServer())
        .get('/company/financial/export?from=2026-08-01&to=2026-08-24')
        .set('Authorization', `Bearer ${tokenLojaA}`)
        .expect(200);

      expect(resposta.headers['content-type']).toContain('text/csv');
      expect(resposta.headers['content-disposition']).toContain(
        'pedidos-2026-08-01-a-2026-08-24.csv',
      );
      // BOM na frente: sem ele o Excel lê o arquivo como Latin-1.
      expect(resposta.text.charCodeAt(0)).toBe(0xfeff);
      expect(resposta.text).toContain('Pedido;Data;Status');
    });
  });
});
