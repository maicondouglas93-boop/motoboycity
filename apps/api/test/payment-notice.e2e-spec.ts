import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { hash } from 'bcryptjs';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

const sufixo = Date.now();
const password = 'senhaSegura123';

const emailLojaA = `teste.aviso.lojaA.${sufixo}@example.com`;
const documentoA = `8811223${String(sufixo).slice(-4)}`;
const emailLojaB = `teste.aviso.lojaB.${sufixo}@example.com`;
const documentoB = `8822334${String(sufixo).slice(-4)}`;
const emailAdmin = `teste.aviso.admin.${sufixo}@example.com`;

/**
 * O ciclo do aviso de pagamento, de ponta a ponta.
 *
 * A afirmação que estes testes precisam sustentar: a loja avisa e a fatura
 * NÃO muda. Só o admin quita. Se algum dia um atalho fizer o aviso dar baixa,
 * é aqui que isso aparece.
 */
describe('PaymentNotice (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tokenLojaA: string;
  let tokenLojaB: string;
  let tokenAdmin: string;
  let faturaDaLojaA: string;

  async function registrarLoja(nome: string, email: string, documento: string) {
    await request(app.getHttpServer())
      .post('/auth/register/company')
      .send({
        name: nome,
        email,
        phone: '33999887766',
        document: documento,
        legalName: `${nome} LTDA`,
        tradeName: nome,
        password,
      })
      .expect(201);
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password });
    return login.body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    await app.init();

    tokenLojaA = await registrarLoja('Loja A Aviso E2E', emailLojaA, documentoA);
    tokenLojaB = await registrarLoja('Loja B Aviso E2E', emailLojaB, documentoB);

    // Um admin de verdade: a fila e as duas decisões são rotas de admin.
    // O hash nasce no próprio teste para não depender do conteúdo do seed.
    const senhaHash = await hash(password, 10);
    await prisma.user.create({
      data: {
        name: 'Admin Aviso E2E',
        email: emailAdmin,
        phone: '33988776655',
        passwordHash: senhaHash,
        type: 'ADMIN',
      },
    });
    const loginAdmin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: emailAdmin, password });
    tokenAdmin = loginAdmin.body.accessToken as string;

    const empresaA = await prisma.company.findFirstOrThrow({ where: { document: documentoA } });
    const fatura = await prisma.invoice.create({
      data: {
        companyId: empresaA.id,
        number: `FAT-AVISO-${sufixo}`,
        status: 'PENDING',
        issueDate: new Date(),
        dueDate: new Date(),
        totalValue: 340,
        driverValueSum: 270,
        platformValueSum: 70,
      },
    });
    faturaDaLojaA = fatura.id;
  });

  afterAll(async () => {
    const documentos = [documentoA, documentoB];
    await prisma.invoicePaymentNotice.deleteMany({
      where: { invoice: { company: { document: { in: documentos } } } },
    });
    await prisma.invoiceStatusHistory.deleteMany({
      where: { invoice: { company: { document: { in: documentos } } } },
    });
    await prisma.invoice.deleteMany({
      where: { company: { document: { in: documentos } } },
    });
    await prisma.companyTeamMember.deleteMany({
      where: { user: { email: { in: [emailLojaA, emailLojaB] } } },
    });
    await prisma.company.deleteMany({ where: { document: { in: [documentoA, documentoB] } } });
    await prisma.user.deleteMany({
      where: { email: { in: [emailLojaA, emailLojaB, emailAdmin] } },
    });
    await app.close();
  });

  it('valida status, data civil e centavos antes de tocar no banco', async () => {
    await request(app.getHttpServer())
      .get('/admin/payment-notices?status=INVALIDO')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(400);

    await request(app.getHttpServer())
      .post(`/company/invoices/${faturaDaLojaA}/payment-notice`)
      .set('Authorization', `Bearer ${tokenLojaA}`)
      .send({ amount: 340.001, paidAt: '2026-08-31' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/company/invoices/${faturaDaLojaA}/payment-notice`)
      .set('Authorization', `Bearer ${tokenLojaA}`)
      .send({ amount: 340, paidAt: '2026-02-30' })
      .expect(400);
  });

  it('a loja avisa e a FATURA NÃO MUDA', async () => {
    const resposta = await request(app.getHttpServer())
      .post(`/company/invoices/${faturaDaLojaA}/payment-notice`)
      .set('Authorization', `Bearer ${tokenLojaA}`)
      .send({ amount: 340, paidAt: '2026-08-31', note: 'PIX' })
      .expect(201);

    expect(resposta.body.status).toBe('PENDING');
    expect(resposta.body.paidAt).toBe('2026-08-31');

    const fatura = await prisma.invoice.findUniqueOrThrow({ where: { id: faturaDaLojaA } });
    expect(fatura.status).toBe('PENDING');
    expect(fatura.paymentDate).toBeNull();

    const acompanhamento = await request(app.getHttpServer())
      .get(`/company/invoices/${faturaDaLojaA}/payment-notices`)
      .set('Authorization', `Bearer ${tokenLojaA}`)
      .expect(200);
    expect(acompanhamento.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ invoiceId: faturaDaLojaA, status: 'PENDING' }),
      ]),
    );
  });

  it('recusa o segundo aviso enquanto o primeiro espera', async () => {
    await request(app.getHttpServer())
      .post(`/company/invoices/${faturaDaLojaA}/payment-notice`)
      .set('Authorization', `Bearer ${tokenLojaA}`)
      .send({ amount: 340, paidAt: '2026-08-31' })
      .expect(409);
  });

  it('aceita apenas um de dois avisos simultâneos para a mesma fatura', async () => {
    const empresaA = await prisma.company.findFirstOrThrow({ where: { document: documentoA } });
    const fatura = await prisma.invoice.create({
      data: {
        companyId: empresaA.id,
        number: `FAT-AVISO-CONCORRENTE-${sufixo}`,
        status: 'PENDING',
        issueDate: new Date(),
        dueDate: new Date(),
        totalValue: 75,
        driverValueSum: 60,
        platformValueSum: 15,
      },
    });

    const requisicao = () =>
      request(app.getHttpServer())
        .post(`/company/invoices/${fatura.id}/payment-notice`)
        .set('Authorization', `Bearer ${tokenLojaA}`)
        .send({ amount: 75, paidAt: '2026-08-31' });
    const respostas = await Promise.all([requisicao(), requisicao()]);

    expect(respostas.map((resposta) => resposta.status).sort()).toEqual([201, 409]);
    await expect(
      prisma.invoicePaymentNotice.count({ where: { invoiceId: fatura.id, status: 'PENDING' } }),
    ).resolves.toBe(1);
  });

  it('a loja B não avisa pagamento da fatura da loja A', async () => {
    await request(app.getHttpServer())
      .post(`/company/invoices/${faturaDaLojaA}/payment-notice`)
      .set('Authorization', `Bearer ${tokenLojaB}`)
      .send({ amount: 340, paidAt: '2026-08-31' })
      .expect(403);
  });

  it('a loja NÃO acessa a fila do admin', async () => {
    await request(app.getHttpServer())
      .get('/admin/payment-notices')
      .set('Authorization', `Bearer ${tokenLojaA}`)
      .expect(403);
  });

  it('a loja NÃO confirma o próprio aviso', async () => {
    // O teste que guarda a regra inteira: o devedor não dá baixa na própria
    // dívida, nem chamando a rota na mão.
    const fila = await request(app.getHttpServer())
      .get('/admin/payment-notices')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    const aviso = fila.body.find((item: { invoiceId: string }) => item.invoiceId === faturaDaLojaA);

    await request(app.getHttpServer())
      .post(`/admin/payment-notices/${aviso.id}/confirm`)
      .set('Authorization', `Bearer ${tokenLojaA}`)
      .send({ paymentDate: '2026-08-31', paymentMethod: 'BILLED' })
      .expect(403);

    const fatura = await prisma.invoice.findUniqueOrThrow({ where: { id: faturaDaLojaA } });
    expect(fatura.status).toBe('PENDING');
  });

  it('a fila do admin mostra a diferença contra o total', async () => {
    const fila = await request(app.getHttpServer())
      .get('/admin/payment-notices')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);

    const aviso = fila.body.find((item: { invoiceId: string }) => item.invoiceId === faturaDaLojaA);
    expect(aviso.invoiceTotalValue).toBe(340);
    expect(aviso.amount).toBe(340);
    expect(aviso.difference).toBe(0);
    expect(aviso.companyName).toBe('Loja A Aviso E2E');
  });

  it('o admin confirma, e SÓ ENTÃO a fatura fica paga', async () => {
    const fila = await request(app.getHttpServer())
      .get('/admin/payment-notices')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    const aviso = fila.body.find((item: { invoiceId: string }) => item.invoiceId === faturaDaLojaA);

    const resposta = await request(app.getHttpServer())
      .post(`/admin/payment-notices/${aviso.id}/confirm`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ paymentDate: '2026-09-01', paymentMethod: 'BILLED' })
      .expect(201);

    expect(resposta.body.status).toBe('CONFIRMED');

    const fatura = await prisma.invoice.findUniqueOrThrow({ where: { id: faturaDaLojaA } });
    expect(fatura.status).toBe('PAID');
    // A data que vale é a que o ADMIN informou, com o extrato na frente.
    expect(fatura.paymentDate?.toISOString().slice(0, 10)).toBe('2026-09-01');

    // E a baixa passou pela markPaid: o histórico da fatura registrou.
    const historico = await prisma.invoiceStatusHistory.findFirst({
      where: { invoiceId: faturaDaLojaA, toStatus: 'PAID' },
    });
    expect(historico).not.toBeNull();
  });

  it('recusa conferir o mesmo aviso duas vezes', async () => {
    const fila = await request(app.getHttpServer())
      .get('/admin/payment-notices?status=CONFIRMED')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    const aviso = fila.body.find((item: { invoiceId: string }) => item.invoiceId === faturaDaLojaA);

    await request(app.getHttpServer())
      .post(`/admin/payment-notices/${aviso.id}/confirm`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ paymentDate: '2026-09-01', paymentMethod: 'BILLED' })
      .expect(409);
  });

  it('desfaz a confirmação do aviso se a fatura já foi paga por outro caminho', async () => {
    const empresaA = await prisma.company.findFirstOrThrow({ where: { document: documentoA } });
    const fatura = await prisma.invoice.create({
      data: {
        companyId: empresaA.id,
        number: `FAT-AVISO-ROLLBACK-${sufixo}`,
        status: 'PENDING',
        issueDate: new Date(),
        dueDate: new Date(),
        totalValue: 90,
        driverValueSum: 70,
        platformValueSum: 20,
      },
    });
    const criado = await request(app.getHttpServer())
      .post(`/company/invoices/${fatura.id}/payment-notice`)
      .set('Authorization', `Bearer ${tokenLojaA}`)
      .send({ amount: 90, paidAt: '2026-09-01' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/admin/financial/invoices/${fatura.id}/mark-paid`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ paymentDate: '2026-09-01', paymentMethod: 'BILLED' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/admin/payment-notices/${criado.body.id}/confirm`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ paymentDate: '2026-09-01', paymentMethod: 'BILLED' })
      .expect(409);

    const aviso = await prisma.invoicePaymentNotice.findUniqueOrThrow({
      where: { id: criado.body.id },
    });
    expect(aviso.status).toBe('PENDING');
    expect(aviso.reviewedAt).toBeNull();
  });

  it('não deixa avisar pagamento de fatura já paga', async () => {
    await request(app.getHttpServer())
      .post(`/company/invoices/${faturaDaLojaA}/payment-notice`)
      .set('Authorization', `Bearer ${tokenLojaA}`)
      .send({ amount: 340, paidAt: '2026-09-01' })
      .expect(409);
  });

  it('exige motivo para recusar', async () => {
    const empresaA = await prisma.company.findFirstOrThrow({ where: { document: documentoA } });
    const outraFatura = await prisma.invoice.create({
      data: {
        companyId: empresaA.id,
        number: `FAT-AVISO-B-${sufixo}`,
        status: 'PENDING',
        issueDate: new Date(),
        dueDate: new Date(),
        totalValue: 100,
        driverValueSum: 80,
        platformValueSum: 20,
      },
    });
    const criado = await request(app.getHttpServer())
      .post(`/company/invoices/${outraFatura.id}/payment-notice`)
      .set('Authorization', `Bearer ${tokenLojaA}`)
      .send({ amount: 50, paidAt: '2026-09-01' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/admin/payment-notices/${criado.body.id}/reject`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ reviewNote: '' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/admin/payment-notices/${criado.body.id}/reject`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ reviewNote: 'Não localizei o PIX no extrato.' })
      .expect(201);

    // Recusado: a fatura continua devendo.
    const fatura = await prisma.invoice.findUniqueOrThrow({ where: { id: outraFatura.id } });
    expect(fatura.status).toBe('PENDING');

    // A restricao e "um PENDENTE", nao "um aviso para sempre": depois da
    // recusa a loja pode corrigir os dados e enviar novamente.
    await request(app.getHttpServer())
      .post(`/company/invoices/${outraFatura.id}/payment-notice`)
      .set('Authorization', `Bearer ${tokenLojaA}`)
      .send({ amount: 100, paidAt: '2026-09-01', note: 'PIX corrigido' })
      .expect(201);

    await prisma.invoicePaymentNotice.deleteMany({ where: { invoiceId: outraFatura.id } });
    await prisma.invoice.delete({ where: { id: outraFatura.id } });
  });
});
