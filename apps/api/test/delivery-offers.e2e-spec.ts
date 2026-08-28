import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { GoogleMapsService } from './../src/maps/google-maps.service';
import { PrismaService } from './../src/prisma/prisma.service';

const uniqueSuffix = Date.now();
const password = 'senhaSegura123';

const companyEmail = `teste.offers.company.${uniqueSuffix}@example.com`;
const companyDocument = `7001234${String(uniqueSuffix).slice(-4)}`;
const driverEmail = `teste.offers.driver.${uniqueSuffix}@example.com`;
const driverCpf = `777${String(uniqueSuffix).slice(-8)}`;
const otherDriverEmail = `teste.offers.other.${uniqueSuffix}@example.com`;
const otherDriverCpf = `778${String(uniqueSuffix).slice(-8)}`;
const serviceTypeCode = `TEST_OFR_${uniqueSuffix}`;

const adminEmail = process.env['ADMIN_SEED_EMAIL'] ?? 'admin@motoboycity.local';
const adminPassword = process.env['ADMIN_SEED_PASSWORD'] ?? 'admin_dev_only_change_me';

const validDropoff = {
  street: 'Rua do Cliente',
  number: '200',
  city: 'Lajinha',
  state: 'MG',
  zip: '36930000',
};

describe('DeliveryOffersController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let adminToken: string;
  let companyToken: string;
  let driverToken: string;
  let driverId: string;
  let otherDriverToken: string;
  let serviceTypeId: string;

  async function createAwaitingDeliveryAndGetOffer(): Promise<{
    deliveryId: string;
    offerId: string;
  }> {
    const response = await request(app.getHttpServer())
      .post('/deliveries')
      .set('Authorization', `Bearer ${companyToken}`)
      .send({ serviceTypeId, dropoffAddress: validDropoff })
      .expect(201);

    const deliveryId = response.body.id as string;
    const offer = await prisma.deliveryOffer.findFirstOrThrow({
      where: { deliveryId, response: 'PENDING' },
    });
    return { deliveryId, offerId: offer.id };
  }

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

    const server = app.getHttpServer();

    const adminLogin = await request(server)
      .post('/auth/login')
      .send({ email: adminEmail, password: adminPassword });
    adminToken = adminLogin.body.accessToken;

    const companyRegister = await request(server).post('/auth/register/company').send({
      name: 'Dono Offers E2E',
      email: companyEmail,
      phone: '33999887766',
      document: companyDocument,
      legalName: 'Offers E2E LTDA',
      tradeName: 'Offers E2E',
      password,
    });
    await request(server)
      .patch(`/admin/companies/${companyRegister.body.companyId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    const companyLogin = await request(server)
      .post('/auth/login')
      .send({ email: companyEmail, password });
    companyToken = companyLogin.body.accessToken;
    await request(server)
      .put('/company/address')
      .set('Authorization', `Bearer ${companyToken}`)
      .send({
        street: 'Rua da Loja',
        number: '100',
        city: 'Lajinha',
        state: 'MG',
        zip: '36930000',
      });

    const driverRegister = await request(server).post('/auth/register/driver').send({
      name: 'Motoboy Offers E2E',
      email: driverEmail,
      phone: '33999887799',
      cpf: driverCpf,
      birthDate: '1990-05-20',
      pixKey: driverEmail,
      pixKeyType: 'EMAIL',
      hasCnpj: false,
      password,
    });
    driverId = driverRegister.body.driverId;
    await request(server)
      .patch(`/admin/drivers/${driverId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    const driverLogin = await request(server)
      .post('/auth/login')
      .send({ email: driverEmail, password });
    driverToken = driverLogin.body.accessToken;
    await request(server)
      .put('/driver/presence')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        availability: 'AVAILABLE',
        location: { lat: -20.153, lng: -41.622, accuracy: 8 },
        appVersion: 'e2e',
        trackingCapability: 'BACKGROUND_V1',
      })
      .expect(200);

    const otherDriverRegister = await request(server).post('/auth/register/driver').send({
      name: 'Motoboy Offers E2E Outro',
      email: otherDriverEmail,
      phone: '33999887788',
      cpf: otherDriverCpf,
      birthDate: '1990-05-20',
      pixKey: otherDriverEmail,
      pixKeyType: 'EMAIL',
      hasCnpj: false,
      password,
    });
    await request(server)
      .patch(`/admin/drivers/${otherDriverRegister.body.driverId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    const otherDriverLogin = await request(server)
      .post('/auth/login')
      .send({ email: otherDriverEmail, password });
    otherDriverToken = otherDriverLogin.body.accessToken;
    // Motoboy "outro" fica UNAVAILABLE de propósito, pra nunca receber oferta
    // — só existe pra testar "tentar responder a oferta de outro motoboy".

    const serviceTypeResponse = await request(server)
      .post('/admin/service-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: serviceTypeCode, name: 'Serviço Teste Offers E2E' });
    serviceTypeId = serviceTypeResponse.body.id;

    await request(server)
      .post('/admin/pricing-tables')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ serviceTypeId, baseFee: 5, perKmFee: 1.5, returnFee: 3 });

    await request(server)
      .patch('/admin/platform-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ driverCommissionPercentage: 80, dispatchOfferTimeoutSeconds: 120 });

    // Elegibilidade de despacho (P1-02) exige um DriverServiceType explícito
    // — sem isto o motoboy nunca fica elegível e nenhuma oferta é criada.
    await request(server)
      .put(`/admin/drivers/${driverId}/service-types`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ serviceTypeIds: [serviceTypeId] })
      .expect(200);
  });

  afterAll(async () => {
    try {
      await prisma.deliveryOffer.deleteMany({ where: { delivery: { serviceTypeId } } });
      await prisma.deliveryStatusHistory.deleteMany({ where: { delivery: { serviceTypeId } } });
      await prisma.deliveryAddress.deleteMany({ where: { delivery: { serviceTypeId } } });
      await prisma.delivery.deleteMany({ where: { serviceTypeId } });
      await prisma.pricingTable.deleteMany({ where: { serviceTypeId } });
      await prisma.driverServiceType.deleteMany({ where: { serviceTypeId } });
      await prisma.serviceType.deleteMany({ where: { code: serviceTypeCode } });

      await prisma.companyAddress.deleteMany({ where: { company: { document: companyDocument } } });
      await prisma.companyStatusHistory.deleteMany({
        where: { company: { document: companyDocument } },
      });
      await prisma.companyTeamMember.deleteMany({
        where: { company: { document: companyDocument } },
      });
      await prisma.company.deleteMany({ where: { document: companyDocument } });
      await prisma.user.deleteMany({ where: { email: companyEmail } });

      await prisma.driverPresenceLog.deleteMany({
        where: { driver: { user: { email: { in: [driverEmail, otherDriverEmail] } } } },
      });
      await prisma.driver.deleteMany({
        where: { user: { email: { in: [driverEmail, otherDriverEmail] } } },
      });
      await prisma.user.deleteMany({ where: { email: { in: [driverEmail, otherDriverEmail] } } });
    } finally {
      await app.close();
    }
  });

  it('rejeita sem token com 401', async () => {
    await request(app.getHttpServer()).patch('/delivery-offers/qualquer-id/accept').expect(401);
  });

  it('rejeita empresa (não-motoboy) com 403', async () => {
    await request(app.getHttpServer())
      .patch('/delivery-offers/qualquer-id/accept')
      .set('Authorization', `Bearer ${companyToken}`)
      .expect(403);
  });

  it('retorna 404 pra oferta inexistente', async () => {
    await request(app.getHttpServer())
      .patch('/delivery-offers/00000000-0000-0000-0000-000000000000/accept')
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(404);
  });

  it('rejeita motoboy tentando responder a oferta de outro motoboy (403)', async () => {
    const { offerId } = await createAwaitingDeliveryAndGetOffer();

    await request(app.getHttpServer())
      .patch(`/delivery-offers/${offerId}/accept`)
      .set('Authorization', `Bearer ${otherDriverToken}`)
      .expect(403);

    // A oferta segue PENDING pro motoboy certo — resolve (recusa) aqui pra
    // não deixar o único motoboy disponível "ocupado" e travar os próximos
    // testes, que dependem dele ser elegível de novo.
    await request(app.getHttpServer())
      .patch(`/delivery-offers/${offerId}/decline`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
  });

  it('motoboy aceita a oferta com sucesso: pedido vira ACCEPTED com driverId atribuído', async () => {
    const { deliveryId, offerId } = await createAwaitingDeliveryAndGetOffer();

    const response = await request(app.getHttpServer())
      .patch(`/delivery-offers/${offerId}/accept`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    expect(response.body).toEqual(expect.objectContaining({ deliveryId }));

    const delivery = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
    expect(delivery.status).toBe('ACCEPTED');
    expect(delivery.driverId).toBe(driverId);

    const ownDeliveries = await request(app.getHttpServer())
      .get('/deliveries?status=ACCEPTED')
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    expect((ownDeliveries.body as Array<{ id: string }>).map((item) => item.id)).toContain(
      deliveryId,
    );

    const otherDriverDeliveries = await request(app.getHttpServer())
      .get('/deliveries?status=ACCEPTED')
      .set('Authorization', `Bearer ${otherDriverToken}`)
      .expect(200);
    expect(
      (otherDriverDeliveries.body as Array<{ id: string }>).map((item) => item.id),
    ).not.toContain(deliveryId);

    const offer = await prisma.deliveryOffer.findUniqueOrThrow({ where: { id: offerId } });
    expect(offer.response).toBe('ACCEPTED');

    // P1-02: motoboy com entrega ACCEPTED fica inelegível pra novas ofertas.
    // Admin cancela (permitido em qualquer status) pra devolver o único
    // motoboy disponível ao pool antes dos próximos testes.
    await request(app.getHttpServer())
      .patch(`/deliveries/${deliveryId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('repetir o aceite da mesma oferta é idempotente', async () => {
    const { deliveryId, offerId } = await createAwaitingDeliveryAndGetOffer();

    const primeiroAceite = await request(app.getHttpServer())
      .patch(`/delivery-offers/${offerId}/accept`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    const segundoAceite = await request(app.getHttpServer())
      .patch(`/delivery-offers/${offerId}/accept`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    expect(segundoAceite.body).toEqual(primeiroAceite.body);
    expect(
      await prisma.deliveryStatusHistory.count({
        where: { deliveryId, fromStatus: 'AWAITING_DRIVER', toStatus: 'ACCEPTED' },
      }),
    ).toBe(1);

    await request(app.getHttpServer())
      .patch(`/deliveries/${deliveryId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('motoboy recusa a oferta: fica DECLINED e o pedido segue AWAITING_DRIVER (sem outro motoboy elegível)', async () => {
    const { deliveryId, offerId } = await createAwaitingDeliveryAndGetOffer();

    const response = await request(app.getHttpServer())
      .patch(`/delivery-offers/${offerId}/decline`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    expect(response.body).toEqual({ ok: true });

    const offer = await prisma.deliveryOffer.findUniqueOrThrow({ where: { id: offerId } });
    expect(offer.response).toBe('DECLINED');

    const delivery = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
    expect(delivery.status).toBe('AWAITING_DRIVER');
    expect(delivery.driverId).toBeNull();
  });

  it('rejeita recusar de novo uma oferta já respondida (409)', async () => {
    const { offerId } = await createAwaitingDeliveryAndGetOffer();

    await request(app.getHttpServer())
      .patch(`/delivery-offers/${offerId}/decline`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/delivery-offers/${offerId}/decline`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(409);
  });
});
