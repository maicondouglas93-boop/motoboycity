import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { GoogleMapsService } from './../src/maps/google-maps.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { desligarTaxasAdicionais } from './isolar-taxas';
import { DispatchService } from './../src/dispatch/dispatch.service';
import { RealtimeGateway } from './../src/realtime/realtime.gateway';

const uniqueSuffix = Date.now();
const password = 'senhaSegura123';

const companyEmail = `teste.batch.company.${uniqueSuffix}@example.com`;
const companyDocument = `8001234${String(uniqueSuffix).slice(-4)}`;
const driver1Email = `teste.batch.driver1.${uniqueSuffix}@example.com`;
const driver1Cpf = `881${String(uniqueSuffix).slice(-8)}`;
const driver2Email = `teste.batch.driver2.${uniqueSuffix}@example.com`;
const driver2Cpf = `882${String(uniqueSuffix).slice(-8)}`;
const serviceTypeCode = `TEST_BATCH_${uniqueSuffix}`;

const adminEmail = process.env['ADMIN_SEED_EMAIL'] ?? 'admin@motoboycity.local';
const adminPassword = process.env['ADMIN_SEED_PASSWORD'] ?? 'admin_dev_only_change_me';

function dropoff(n: number) {
  return {
    street: `Rua do Cliente ${n}`,
    number: String(100 + n),
    city: 'Lajinha',
    state: 'MG',
    zip: '36930000',
  };
}

function batchPayload(serviceTypeId: string, count = 3) {
  return {
    deliveries: Array.from({ length: count }, (_, index) => ({
      serviceTypeId,
      dropoffAddress: dropoff(index),
    })),
  };
}

type RealtimeGatewayMock = {
  emitToDriver: jest.Mock;
  emitAdminActivity: jest.Mock;
  emitDeliveryUpdated: jest.Mock;
  emitDriverPresence: jest.Mock;
  emitDriverLocation: jest.Mock;
  emitDeliveryLocation: jest.Mock;
};

describe('Despacho em lote — criação, concorrência e realtime (e2e)', () => {
  let app: INestApplication<App>;
  /** Devolve as taxas adicionais ao estado original no fim da suite. */
  let religarTaxas: () => Promise<void> = async () => undefined;
  let prisma: PrismaService;
  let dispatchService: DispatchService;
  let realtime: RealtimeGatewayMock;

  let adminToken: string;
  let companyToken: string;
  let driver1Token: string;
  let driver1Id: string;
  let driver2Token: string;
  let driver2Id: string;
  let serviceTypeId: string;

  async function setAvailability(token: string, availability: 'AVAILABLE' | 'UNAVAILABLE') {
    await request(app.getHttpServer())
      .put('/driver/presence')
      .set('Authorization', `Bearer ${token}`)
      .send(
        availability === 'AVAILABLE'
          ? {
              availability,
              location: { lat: -20.153, lng: -41.622, accuracy: 8 },
              appVersion: 'e2e',
              trackingCapability: 'BACKGROUND_V1',
            }
          : { availability },
      );
  }

  async function createBatch(count = 3): Promise<{
    batchId: string;
    deliveries: Array<{ id: string; batchId: string | null; status: string; totalValue: number }>;
  }> {
    const response = await request(app.getHttpServer())
      .post('/deliveries/batch')
      .set('Authorization', `Bearer ${companyToken}`)
      .send(batchPayload(serviceTypeId, count))
      .expect(201);
    return response.body;
  }

  async function pendingOffersFor(deliveryIds: string[]) {
    return prisma.deliveryOffer.findMany({
      where: { deliveryId: { in: deliveryIds }, response: 'PENDING' },
    });
  }

  /** Qualquer entrega que sobra em AWAITING_DRIVER (mesmo sem oferta
   * pendente) ou ACCEPTED entre testes é um problema real: assim que
   * QUALQUER motoboy ficar disponível de novo, driver-presence.service
   * chama dispatchService.dispatchAvailableDeliveries() e varre TODAS as
   * entregas AWAITING_DRIVER do banco — inclusive as órfãs de um teste
   * anterior — podendo despachá-las pro motoboy do próximo teste e deixá-lo
   * "ocupado" de um jeito inesperado. Admin pode cancelar em qualquer
   * status, então usa isso pra sempre fechar o lote no fim de cada teste. */
  async function releaseAllDeliveries(deliveryIds: string[]): Promise<void> {
    const current = await prisma.delivery.findMany({ where: { id: { in: deliveryIds } } });
    for (const delivery of current) {
      if (delivery.status !== 'CANCELLED' && delivery.status !== 'COMPLETED') {
        await request(app.getHttpServer())
          .patch(`/deliveries/${delivery.id}/cancel`)
          .set('Authorization', `Bearer ${adminToken}`);
      }
    }
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GoogleMapsService)
      .useValue({ getDistance: async () => ({ distanceKm: 5, durationMinutes: 20 }) })
      .overrideProvider(RealtimeGateway)
      .useValue({
        emitToDriver: jest.fn(),
        emitAdminActivity: jest.fn(),
        emitDeliveryUpdated: jest.fn(),
        emitDriverPresence: jest.fn(),
        emitDriverLocation: jest.fn(),
        emitDeliveryLocation: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    dispatchService = moduleFixture.get(DispatchService);
    realtime = moduleFixture.get(RealtimeGateway) as unknown as RealtimeGatewayMock;
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

    const companyRegister = await request(server).post('/auth/register/company').send({
      name: 'Dono Lote E2E',
      email: companyEmail,
      phone: '33999887766',
      document: companyDocument,
      legalName: 'Lote E2E LTDA',
      tradeName: 'Lote E2E',
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

    async function registerApproveDriver(email: string, cpf: string) {
      const register = await request(server)
        .post('/auth/register/driver')
        .send({
          name: `Motoboy Lote E2E ${email}`,
          email,
          phone: '33999887799',
          cpf,
          birthDate: '1990-05-20',
          pixKey: email,
          pixKeyType: 'EMAIL',
          hasCnpj: false,
          password,
        });
      const registeredDriverId = register.body.driverId as string;
      await request(server)
        .patch(`/admin/drivers/${registeredDriverId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);
      const login = await request(server).post('/auth/login').send({ email, password });
      return { driverId: registeredDriverId, token: login.body.accessToken as string };
    }

    const d1 = await registerApproveDriver(driver1Email, driver1Cpf);
    driver1Id = d1.driverId;
    driver1Token = d1.token;
    const d2 = await registerApproveDriver(driver2Email, driver2Cpf);
    driver2Id = d2.driverId;
    driver2Token = d2.token;

    const serviceTypeResponse = await request(server)
      .post('/admin/service-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: serviceTypeCode, name: 'Serviço Teste Lote E2E' });
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
    // pra cada motoboy — sem isto nenhum dos dois nunca fica elegível.
    for (const id of [driver1Id, driver2Id]) {
      await request(server)
        .put(`/admin/drivers/${id}/service-types`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ serviceTypeIds: [serviceTypeId] })
        .expect(200);
    }

    // Os dois começam UNAVAILABLE — cada teste liga o(s) motoboy(s) que
    // precisa, na ordem que precisa, pra manter o próximo elegível previsível.
    await setAvailability(driver1Token, 'UNAVAILABLE');
    await setAvailability(driver2Token, 'UNAVAILABLE');
  });

  afterAll(async () => {
    try {
      await religarTaxas();
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

      await prisma.driverServiceType.deleteMany({
        where: { driver: { user: { email: { in: [driver1Email, driver2Email] } } } },
      });
      await prisma.driverPresenceLog.deleteMany({
        where: { driver: { user: { email: { in: [driver1Email, driver2Email] } } } },
      });
      await prisma.driver.deleteMany({
        where: { user: { email: { in: [driver1Email, driver2Email] } } },
      });
      await prisma.user.deleteMany({ where: { email: { in: [driver1Email, driver2Email] } } });
    } finally {
      await app.close();
    }
  });

  beforeEach(() => {
    realtime.emitToDriver.mockClear();
    realtime.emitAdminActivity.mockClear();
  });

  describe('criação via POST /deliveries/batch', () => {
    it('rejeita sem token com 401', async () => {
      await request(app.getHttpServer())
        .post('/deliveries/batch')
        .send(batchPayload(serviceTypeId))
        .expect(401);
    });

    it('rejeita motoboy tentando criar lote com 403', async () => {
      await request(app.getHttpServer())
        .post('/deliveries/batch')
        .set('Authorization', `Bearer ${driver1Token}`)
        .send(batchPayload(serviceTypeId))
        .expect(403);
    });

    it('rejeita lote com menos de duas entregas (400)', async () => {
      await request(app.getHttpServer())
        .post('/deliveries/batch')
        .set('Authorization', `Bearer ${companyToken}`)
        .send(batchPayload(serviceTypeId, 1))
        .expect(400);
    });

    it('rejeita item de lote com scheduledAt (400)', async () => {
      const payload = batchPayload(serviceTypeId, 2);
      (payload.deliveries[0] as Record<string, unknown>)['scheduledAt'] =
        '2030-01-01T10:00:00.000Z';

      await request(app.getHttpServer())
        .post('/deliveries/batch')
        .set('Authorization', `Bearer ${companyToken}`)
        .send(payload)
        .expect(400);
    });

    it('cria lote de 3 entregas com o mesmo batchId e valores por item, e despacha uma única oferta agregada ao motoboy disponível', async () => {
      await setAvailability(driver1Token, 'AVAILABLE');

      const { batchId, deliveries } = await createBatch(3);

      expect(deliveries).toHaveLength(3);
      expect(new Set(deliveries.map((delivery) => delivery.batchId))).toEqual(new Set([batchId]));
      for (const delivery of deliveries) {
        expect(delivery.status).toBe('AWAITING_DRIVER');
        expect(delivery.totalValue).toBe(12.5);
      }

      const deliveryIds = deliveries.map((delivery) => delivery.id);
      const offers = await pendingOffersFor(deliveryIds);
      expect(offers).toHaveLength(3);
      expect(new Set(offers.map((offer) => offer.driverId))).toEqual(new Set([driver1Id]));

      expect(realtime.emitToDriver).toHaveBeenCalledTimes(1);
      const [emittedDriverId, event, payload] = realtime.emitToDriver.mock.calls[0]!;
      expect(emittedDriverId).toBe(driver1Id);
      expect(event).toBe('delivery:offer');
      expect(payload).toEqual(
        expect.objectContaining({ batchId, deliveryCount: 3, driverValue: 30, distanceKm: 15 }),
      );

      // Libera o motoboy e fecha o lote pros próximos testes — sem isto ele
      // fica órfão em AWAITING_DRIVER e pode ser varrido e despachado pro
      // motoboy do PRÓXIMO teste assim que ele ficar disponível.
      await request(app.getHttpServer())
        .patch(`/delivery-offers/${offers[0]!.id}/decline`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);
      await releaseAllDeliveries(deliveryIds);
      await setAvailability(driver1Token, 'UNAVAILABLE');
    });
  });

  describe('duas chamadas simultâneas a dispatchDelivery', () => {
    it('não duplicam ofertas nem dividem o lote entre dois motoboys — só um vence a corrida', async () => {
      const { deliveries } = await createBatch(2);
      const deliveryIds = deliveries.map((delivery) => delivery.id);

      // Nenhum motoboy disponível ainda: o lote fica AWAITING_DRIVER sem
      // oferta pendente (a chamada automática de createBatch não achou ninguém).
      expect(await pendingOffersFor(deliveryIds)).toHaveLength(0);

      await setAvailability(driver1Token, 'AVAILABLE');
      await setAvailability(driver2Token, 'AVAILABLE');

      await Promise.all([
        dispatchService.dispatchDelivery(deliveryIds[0]!),
        dispatchService.dispatchDelivery(deliveryIds[0]!),
      ]);

      const offers = await pendingOffersFor(deliveryIds);
      expect(offers).toHaveLength(2);
      const driverIds = new Set(offers.map((offer) => offer.driverId));
      expect(driverIds.size).toBe(1);
      expect([driver1Id, driver2Id]).toContain([...driverIds][0]);

      const winner = [...driverIds][0]!;
      const winnerToken = winner === driver1Id ? driver1Token : driver2Token;
      await request(app.getHttpServer())
        .patch(`/delivery-offers/${offers[0]!.id}/decline`)
        .set('Authorization', `Bearer ${winnerToken}`)
        .expect(200);
      await releaseAllDeliveries(deliveryIds);
      await setAvailability(driver1Token, 'UNAVAILABLE');
      await setAvailability(driver2Token, 'UNAVAILABLE');
    });
  });

  describe('aceite vs. cancelamento simultâneos', () => {
    it('exatamente um dos dois vence, e o estado final do lote é consistente', async () => {
      await setAvailability(driver1Token, 'AVAILABLE');
      const { deliveries } = await createBatch(2);
      const deliveryIds = deliveries.map((delivery) => delivery.id);
      const [offer] = await pendingOffersFor(deliveryIds);

      const [acceptOutcome, cancelOutcome] = await Promise.allSettled([
        request(app.getHttpServer())
          .patch(`/delivery-offers/${offer!.id}/accept`)
          .set('Authorization', `Bearer ${driver1Token}`),
        request(app.getHttpServer())
          .patch(`/deliveries/${deliveryIds[0]}/cancel`)
          .set('Authorization', `Bearer ${companyToken}`),
      ]);

      const acceptStatus = acceptOutcome.status === 'fulfilled' ? acceptOutcome.value.status : null;
      const cancelStatus = cancelOutcome.status === 'fulfilled' ? cancelOutcome.value.status : null;

      const finalDeliveries = await prisma.delivery.findMany({
        where: { id: { in: deliveryIds } },
      });
      const finalOffers = await prisma.deliveryOffer.findMany({
        where: { deliveryId: { in: deliveryIds } },
      });

      if (acceptStatus === 200) {
        expect(cancelStatus).toBe(409);
        expect(finalDeliveries.every((delivery) => delivery.status === 'ACCEPTED')).toBe(true);
        expect(finalDeliveries.every((delivery) => delivery.driverId === driver1Id)).toBe(true);
        expect(finalOffers.every((item) => item.response === 'ACCEPTED')).toBe(true);
      } else {
        expect(acceptStatus).toBe(409);
        expect(cancelStatus).toBe(200);
        expect(finalDeliveries.every((delivery) => delivery.status === 'CANCELLED')).toBe(true);
        expect(finalDeliveries.every((delivery) => delivery.driverId === null)).toBe(true);
        expect(finalOffers.every((item) => item.response === 'EXPIRED')).toBe(true);
      }

      await releaseAllDeliveries(deliveryIds);
      await setAvailability(driver1Token, 'UNAVAILABLE');
    });
  });

  describe('aceite vs. expiração simultâneos', () => {
    it('exatamente um dos dois vence: ou o lote é aceito, ou expira por inteiro', async () => {
      await setAvailability(driver1Token, 'AVAILABLE');
      const { deliveries } = await createBatch(2);
      const deliveryIds = deliveries.map((delivery) => delivery.id);
      const [offer] = await pendingOffersFor(deliveryIds);

      const [acceptOutcome, expireOutcome] = await Promise.allSettled([
        request(app.getHttpServer())
          .patch(`/delivery-offers/${offer!.id}/accept`)
          .set('Authorization', `Bearer ${driver1Token}`),
        dispatchService.handleOfferExpired(offer!.id),
      ]);

      expect(expireOutcome.status).toBe('fulfilled');
      const acceptStatus = acceptOutcome.status === 'fulfilled' ? acceptOutcome.value.status : null;

      const finalDeliveries = await prisma.delivery.findMany({
        where: { id: { in: deliveryIds } },
      });
      const finalOffers = await prisma.deliveryOffer.findMany({
        where: { deliveryId: { in: deliveryIds } },
      });

      if (acceptStatus === 200) {
        expect(finalDeliveries.every((delivery) => delivery.status === 'ACCEPTED')).toBe(true);
        expect(finalOffers.every((item) => item.response === 'ACCEPTED')).toBe(true);
      } else {
        expect(acceptStatus).toBe(409);
        expect(finalDeliveries.every((delivery) => delivery.status === 'AWAITING_DRIVER')).toBe(
          true,
        );
        expect(finalOffers.every((item) => item.response === 'EXPIRED')).toBe(true);
      }

      await releaseAllDeliveries(deliveryIds);
      await setAvailability(driver1Token, 'UNAVAILABLE');
    });
  });

  describe('recusa em lote', () => {
    it('marca todas as ofertas do lote como DECLINED e redespacha o lote inteiro pro próximo motoboy elegível', async () => {
      await setAvailability(driver1Token, 'AVAILABLE');
      await setAvailability(driver2Token, 'AVAILABLE');

      const { deliveries } = await createBatch(2);
      const deliveryIds = deliveries.map((delivery) => delivery.id);
      const firstOffers = await pendingOffersFor(deliveryIds);
      expect(firstOffers).toHaveLength(2);
      const firstDriverId = firstOffers[0]!.driverId;
      expect(firstDriverId).toBe(driver1Id); // driver1 ficou disponível primeiro

      realtime.emitAdminActivity.mockClear();
      realtime.emitToDriver.mockClear();

      await request(app.getHttpServer())
        .patch(`/delivery-offers/${firstOffers[0]!.id}/decline`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);

      const declinedOffers = await prisma.deliveryOffer.findMany({
        where: { id: { in: firstOffers.map((offer) => offer.id) } },
      });
      expect(declinedOffers.every((offer) => offer.response === 'DECLINED')).toBe(true);

      const secondOffers = await pendingOffersFor(deliveryIds);
      expect(secondOffers).toHaveLength(2);
      expect(new Set(secondOffers.map((offer) => offer.driverId))).toEqual(new Set([driver2Id]));

      expect(realtime.emitToDriver).toHaveBeenCalledWith(
        driver2Id,
        'delivery:offer',
        expect.objectContaining({ deliveryCount: 2 }),
      );

      await request(app.getHttpServer())
        .patch(`/delivery-offers/${secondOffers[0]!.id}/decline`)
        .set('Authorization', `Bearer ${driver2Token}`)
        .expect(200);

      const finalDeliveries = await prisma.delivery.findMany({
        where: { id: { in: deliveryIds } },
      });
      expect(finalDeliveries.every((delivery) => delivery.status === 'AWAITING_DRIVER')).toBe(true);
      expect(await pendingOffersFor(deliveryIds)).toHaveLength(0);

      await releaseAllDeliveries(deliveryIds);
      await setAvailability(driver1Token, 'UNAVAILABLE');
      await setAvailability(driver2Token, 'UNAVAILABLE');
    });
  });

  describe('aceite em lote via HTTP', () => {
    it('motoboy aceita o lote inteiro: todas as entregas viram ACCEPTED com o mesmo motoboy', async () => {
      await setAvailability(driver1Token, 'AVAILABLE');
      const { batchId, deliveries } = await createBatch(3);
      const deliveryIds = deliveries.map((delivery) => delivery.id);
      const [offer] = await pendingOffersFor(deliveryIds);

      const response = await request(app.getHttpServer())
        .patch(`/delivery-offers/${offer!.id}/accept`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({ batchId, deliveryIds: expect.arrayContaining(deliveryIds) }),
      );

      const finalDeliveries = await prisma.delivery.findMany({
        where: { id: { in: deliveryIds } },
      });
      expect(finalDeliveries.every((delivery) => delivery.status === 'ACCEPTED')).toBe(true);
      expect(finalDeliveries.every((delivery) => delivery.driverId === driver1Id)).toBe(true);

      await releaseAllDeliveries(deliveryIds);
      await setAvailability(driver1Token, 'UNAVAILABLE');
    });
  });
});
