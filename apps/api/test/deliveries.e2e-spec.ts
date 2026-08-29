import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { GoogleMapsService } from './../src/maps/google-maps.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { desligarTaxasAdicionais } from './isolar-taxas';

const uniqueSuffix = Date.now();
const password = 'senhaSegura123';

const companyAEmail = `teste.deliveries.a.${uniqueSuffix}@example.com`;
const companyADocument = `4001234${String(uniqueSuffix).slice(-4)}`;
const companyBEmail = `teste.deliveries.b.${uniqueSuffix}@example.com`;
const companyBDocument = `4001235${String(uniqueSuffix).slice(-4)}`;
const companyCEmail = `teste.deliveries.c.${uniqueSuffix}@example.com`;
const companyCDocument = `4001236${String(uniqueSuffix).slice(-4)}`;
const driverEmail = `teste.deliveries.driver.${uniqueSuffix}@example.com`;
const driverCpf = `666${String(uniqueSuffix).slice(-8)}`;
const serviceTypeCode = `TEST_DLV_${uniqueSuffix}`;

const adminEmail = process.env['ADMIN_SEED_EMAIL'] ?? 'admin@motoboycity.local';
const adminPassword = process.env['ADMIN_SEED_PASSWORD'] ?? 'admin_dev_only_change_me';

const validDropoff = {
  street: 'Rua do Cliente',
  number: '200',
  city: 'Lajinha',
  state: 'MG',
  zip: '36930000',
};

describe('DeliveriesController (e2e)', () => {
  let app: INestApplication<App>;
  /** Devolve as taxas adicionais ao estado original no fim da suite. */
  let religarTaxas: () => Promise<void> = async () => undefined;
  let prisma: PrismaService;

  let adminToken: string;
  let companyAToken: string;
  let companyBToken: string;
  let companyCToken: string;
  let driverToken: string;
  let serviceTypeId: string;
  let deliveryId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GoogleMapsService)
      .useValue({ getDistance: async () => ({ distanceKm: 5, durationMinutes: 20 }) })
      .compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    await app.init();

    /**
     * Esta suite calcula preco esperado a partir da tabela que ela mesma cria.
     * Taxa adicional ativa no banco de desenvolvimento entraria na conta e faria
     * a suite passar de dia e falhar de noite.
     */
    religarTaxas = await desligarTaxasAdicionais(prisma);

    const server = app.getHttpServer();

    const adminLogin = await request(server)
      .post('/auth/login')
      .send({ email: adminEmail, password: adminPassword });
    adminToken = adminLogin.body.accessToken;

    async function registerLoginAndApproveCompany(email: string, document: string) {
      const register = await request(server)
        .post('/auth/register/company')
        .send({
          name: 'Dono Teste E2E',
          email,
          phone: '33999887766',
          document,
          legalName: `${email} LTDA`,
          tradeName: email,
          password,
        });
      await request(server)
        .patch(`/admin/companies/${register.body.companyId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);
      const login = await request(server).post('/auth/login').send({ email, password });
      return login.body.accessToken as string;
    }

    companyAToken = await registerLoginAndApproveCompany(companyAEmail, companyADocument);
    companyBToken = await registerLoginAndApproveCompany(companyBEmail, companyBDocument);
    companyCToken = await registerLoginAndApproveCompany(companyCEmail, companyCDocument);

    await request(server)
      .put('/company/address')
      .set('Authorization', `Bearer ${companyAToken}`)
      .send({
        street: 'Rua da Loja A',
        number: '100',
        city: 'Lajinha',
        state: 'MG',
        zip: '36930000',
      });
    await request(server)
      .put('/company/address')
      .set('Authorization', `Bearer ${companyBToken}`)
      .send({
        street: 'Rua da Loja B',
        number: '100',
        city: 'Lajinha',
        state: 'MG',
        zip: '36930000',
      });
    // Empresa C fica sem endereço de propósito, pra testar o erro.

    await request(server).post('/auth/register/driver').send({
      name: 'Driver Teste E2E',
      email: driverEmail,
      phone: '33999887799',
      cpf: driverCpf,
      birthDate: '1990-05-20',
      pixKey: driverEmail,
      pixKeyType: 'EMAIL',
      hasCnpj: false,
      password,
    });
    const driverLogin = await request(server)
      .post('/auth/login')
      .send({ email: driverEmail, password });
    driverToken = driverLogin.body.accessToken;

    const serviceTypeResponse = await request(server)
      .post('/admin/service-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: serviceTypeCode, name: 'Serviço Teste Deliveries E2E' });
    serviceTypeId = serviceTypeResponse.body.id;

    await request(server)
      .post('/admin/pricing-tables')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ serviceTypeId, baseFee: 5, perKmFee: 1.5, returnFee: 3 });

    await request(server)
      .patch('/admin/platform-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ driverCommissionPercentage: 80, dispatchOfferTimeoutSeconds: 60 });
  });

  afterAll(async () => {
    try {
      await religarTaxas();
      await prisma.deliveryOffer.deleteMany({ where: { delivery: { serviceTypeId } } });
      await prisma.deliveryStatusHistory.deleteMany({ where: { delivery: { serviceTypeId } } });
      await prisma.deliveryAddress.deleteMany({ where: { delivery: { serviceTypeId } } });
      await prisma.delivery.deleteMany({ where: { serviceTypeId } });
      await prisma.pricingTable.deleteMany({ where: { serviceTypeId } });
      await prisma.serviceType.deleteMany({ where: { code: serviceTypeCode } });

      for (const document of [companyADocument, companyBDocument, companyCDocument]) {
        await prisma.companyAddress.deleteMany({ where: { company: { document } } });
        await prisma.companyStatusHistory.deleteMany({ where: { company: { document } } });
        await prisma.companyTeamMember.deleteMany({ where: { company: { document } } });
        await prisma.company.deleteMany({ where: { document } });
      }
      for (const email of [companyAEmail, companyBEmail, companyCEmail]) {
        await prisma.user.deleteMany({ where: { email } });
      }
      await prisma.driver.deleteMany({ where: { user: { email: driverEmail } } });
      await prisma.user.deleteMany({ where: { email: driverEmail } });
    } finally {
      await app.close();
    }
  });

  it('rejeita criação sem token com 401', async () => {
    await request(app.getHttpServer())
      .post('/deliveries')
      .send({ serviceTypeId, dropoffAddress: validDropoff })
      .expect(401);
  });

  it('rejeita criação por motoboy com 403', async () => {
    await request(app.getHttpServer())
      .post('/deliveries')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ serviceTypeId, dropoffAddress: validDropoff })
      .expect(403);
  });

  it('rejeita criação por admin com 403 (CompanyOnlyGuard)', async () => {
    await request(app.getHttpServer())
      .post('/deliveries')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ serviceTypeId, dropoffAddress: validDropoff })
      .expect(403);
  });

  it('rejeita criação de empresa sem endereço de coleta cadastrado com 409', async () => {
    await request(app.getHttpServer())
      .post('/deliveries')
      .set('Authorization', `Bearer ${companyCToken}`)
      .send({ serviceTypeId, dropoffAddress: validDropoff })
      .expect(409);
  });

  it('empresa A cria um pedido, com valores calculados corretamente', async () => {
    const response = await request(app.getHttpServer())
      .post('/deliveries')
      .set('Authorization', `Bearer ${companyAToken}`)
      .send({ serviceTypeId, dropoffAddress: validDropoff })
      .expect(201);

    deliveryId = response.body.id;
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'AWAITING_DRIVER',
        distanceKm: 5,
        totalValue: 12.5,
        driverValue: 10,
        platformValue: 2.5,
        requiresReturn: false,
        returnValue: null,
      }),
    );
    expect(response.body.addresses).toHaveLength(2);
  });

  it('empresa A cria um segundo pedido com requiresReturn, valor de retorno é somado sem comissão da plataforma', async () => {
    const response = await request(app.getHttpServer())
      .post('/deliveries')
      .set('Authorization', `Bearer ${companyAToken}`)
      .send({ serviceTypeId, dropoffAddress: validDropoff, requiresReturn: true })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        totalValue: 15.5,
        driverValue: 13,
        platformValue: 2.5,
        requiresReturn: true,
        returnValue: 3,
      }),
    );
  });

  /**
   * A pergunta real de quem opera quase nunca e o numero do pedido: e "cade o
   * pedido da Maria?". A busca casava so `externalOrderNumber`, modalidade e
   * numero — a empresa mantinha agenda de clientes e ainda precisava saber o
   * numero de cor para achar qualquer coisa.
   */
  describe('busca por destinatário', () => {
    let buscaDeliveryId: string;

    beforeAll(async () => {
      const criado = await request(app.getHttpServer())
        .post('/deliveries')
        .set('Authorization', `Bearer ${companyAToken}`)
        .send({
          serviceTypeId,
          dropoffAddress: validDropoff,
          recipientName: 'Maria Aparecida Fonseca',
          recipientPhone: '33988887777',
        })
        .expect(201);
      buscaDeliveryId = criado.body.id;
    });

    async function buscar(q: string) {
      const response = await request(app.getHttpServer())
        .get('/deliveries/search')
        .query({ q })
        .set('Authorization', `Bearer ${companyAToken}`)
        .expect(200);
      return (response.body.items as Array<{ id: string }>).map((item) => item.id);
    }

    it('acha por parte do nome, sem diferenciar maiúscula', async () => {
      expect(await buscar('aparecida')).toContain(buscaDeliveryId);
    });

    it('acha pelo telefone digitado com máscara', async () => {
      expect(await buscar('(33) 98888-7777')).toContain(buscaDeliveryId);
    });

    it('não devolve o pedido para um nome que não é dele', async () => {
      expect(await buscar('joaquim')).not.toContain(buscaDeliveryId);
    });

    /**
     * O escopo por empresa continua valendo: buscar pelo nome certo na conta
     * errada nao pode revelar o pedido de outra loja.
     */
    it('não vaza o pedido da empresa A para a empresa B', async () => {
      const response = await request(app.getHttpServer())
        .get('/deliveries/search')
        .query({ q: 'aparecida' })
        .set('Authorization', `Bearer ${companyBToken}`)
        .expect(200);
      expect(
        (response.body.items as Array<{ id: string }>).some(
          (item) => item.id === buscaDeliveryId,
        ),
      ).toBe(false);
    });
  });

  it('empresa A lista e vê o próprio pedido', async () => {
    const response = await request(app.getHttpServer())
      .get('/deliveries')
      .set('Authorization', `Bearer ${companyAToken}`)
      .expect(200);

    expect(
      (response.body as Array<{ id: string }>).some((delivery) => delivery.id === deliveryId),
    ).toBe(true);
  });

  it('empresa B não vê o pedido da empresa A na listagem', async () => {
    const response = await request(app.getHttpServer())
      .get('/deliveries')
      .set('Authorization', `Bearer ${companyBToken}`)
      .expect(200);

    expect(
      (response.body as Array<{ id: string }>).some((delivery) => delivery.id === deliveryId),
    ).toBe(false);
  });

  it('empresa B não consegue ver o detalhe do pedido da empresa A (403)', async () => {
    await request(app.getHttpServer())
      .get(`/deliveries/${deliveryId}`)
      .set('Authorization', `Bearer ${companyBToken}`)
      .expect(403);
  });

  it('empresa B não consegue cancelar o pedido da empresa A (403)', async () => {
    await request(app.getHttpServer())
      .patch(`/deliveries/${deliveryId}/cancel`)
      .set('Authorization', `Bearer ${companyBToken}`)
      .expect(403);
  });

  it('admin vê o pedido da empresa A no detalhe', async () => {
    await request(app.getHttpServer())
      .get(`/deliveries/${deliveryId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('empresa A cancela o próprio pedido enquanto ainda está AWAITING_DRIVER', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/deliveries/${deliveryId}/cancel`)
      .set('Authorization', `Bearer ${companyAToken}`)
      .expect(200);

    expect(response.body.status).toBe('CANCELLED');
  });

  it('rejeita cancelar de novo um pedido já CANCELLED (409)', async () => {
    await request(app.getHttpServer())
      .patch(`/deliveries/${deliveryId}/cancel`)
      .set('Authorization', `Bearer ${companyAToken}`)
      .expect(409);
  });

  it('retorna 404 para pedido inexistente', async () => {
    await request(app.getHttpServer())
      .get('/deliveries/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${companyAToken}`)
      .expect(404);
  });
});
