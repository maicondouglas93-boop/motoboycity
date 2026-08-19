import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { GoogleMapsService } from './../src/maps/google-maps.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { RealtimeGateway } from './../src/realtime/realtime.gateway';

const uniqueSuffix = Date.now();
const password = 'senhaSegura123';

const companyEmail = `teste.lifecycle.company.${uniqueSuffix}@example.com`;
const companyDocument = `9001234${String(uniqueSuffix).slice(-4)}`;
const driver1Email = `teste.lifecycle.driver1.${uniqueSuffix}@example.com`;
const driver1Cpf = `991${String(uniqueSuffix).slice(-8)}`;
const driver2Email = `teste.lifecycle.driver2.${uniqueSuffix}@example.com`;
const driver2Cpf = `992${String(uniqueSuffix).slice(-8)}`;
const serviceTypeCode = `TEST_LIFECYCLE_${uniqueSuffix}`;

const adminEmail = process.env['ADMIN_SEED_EMAIL'] ?? 'admin@motoboycity.local';
const adminPassword = process.env['ADMIN_SEED_PASSWORD'] ?? 'admin_dev_only_change_me';

const pickupLat = -20.15;
const pickupLng = -41.74;
const nearPickup = { lat: -20.1501, lng: -41.7401 };
const farFromPickup = { lat: -20.3, lng: -41.9 };

function dropoff(n: number) {
  return {
    street: `Rua do Cliente ${n}`,
    number: String(100 + n),
    city: 'Lajinha',
    state: 'MG',
    zip: '36930000',
  };
}

type RealtimeGatewayMock = { emitToDriver: jest.Mock; emitAdminActivity: jest.Mock };

describe('Ciclo de vida da entrega — collect/deliver/completeReturn (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
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
      .send({ availability });
  }

  async function pendingOfferFor(deliveryId: string) {
    return prisma.deliveryOffer.findFirstOrThrow({ where: { deliveryId, response: 'PENDING' } });
  }

  /** Garante que nenhuma entrega desta suíte fica AWAITING_DRIVER/ACCEPTED/
   * COLLECTED/DELIVERED entre testes — sem isto, o próximo motoboy a ficar
   * disponível pode receber um lote órfão de um teste anterior (mesmo
   * motivo documentado em delivery-batch-dispatch.e2e-spec.ts). */
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
      .useValue({ emitToDriver: jest.fn(), emitAdminActivity: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    realtime = moduleFixture.get(RealtimeGateway) as unknown as RealtimeGatewayMock;
    await app.init();

    const server = app.getHttpServer();

    const adminLogin = await request(server)
      .post('/auth/login')
      .send({ email: adminEmail, password: adminPassword });
    adminToken = adminLogin.body.accessToken;

    const companyRegister = await request(server).post('/auth/register/company').send({
      name: 'Dono Lifecycle E2E',
      email: companyEmail,
      phone: '33999887766',
      document: companyDocument,
      legalName: 'Lifecycle E2E LTDA',
      tradeName: 'Lifecycle E2E',
      password,
    });
    await request(server)
      .patch(`/admin/companies/${companyRegister.body.companyId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    const companyLogin = await request(server).post('/auth/login').send({ email: companyEmail, password });
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
        lat: pickupLat,
        lng: pickupLng,
      });

    async function registerApproveDriver(email: string, cpf: string) {
      const register = await request(server).post('/auth/register/driver').send({
        name: `Motoboy Lifecycle E2E ${email}`,
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
      .send({ code: serviceTypeCode, name: 'Serviço Teste Lifecycle E2E' });
    serviceTypeId = serviceTypeResponse.body.id;

    await request(server)
      .post('/admin/pricing-tables')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ serviceTypeId, baseFee: 5, perKmFee: 1.5, returnFee: 3 });

    await request(server)
      .patch('/admin/platform-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        driverCommissionPercentage: 80,
        dispatchOfferTimeoutSeconds: 120,
        returnProximityRadiusMeters: 100,
      });

    for (const id of [driver1Id, driver2Id]) {
      await request(server)
        .put(`/admin/drivers/${id}/service-types`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ serviceTypeIds: [serviceTypeId] })
        .expect(200);
    }

    await setAvailability(driver1Token, 'UNAVAILABLE');
    await setAvailability(driver2Token, 'UNAVAILABLE');
  });

  afterAll(async () => {
    await prisma.deliveryOffer.deleteMany({ where: { delivery: { serviceTypeId } } });
    await prisma.deliveryStatusHistory.deleteMany({ where: { delivery: { serviceTypeId } } });
    await prisma.deliveryAddress.deleteMany({ where: { delivery: { serviceTypeId } } });
    await prisma.delivery.deleteMany({ where: { serviceTypeId } });
    await prisma.pricingTable.deleteMany({ where: { serviceTypeId } });
    await prisma.driverServiceType.deleteMany({ where: { serviceTypeId } });
    await prisma.serviceType.deleteMany({ where: { code: serviceTypeCode } });

    await prisma.companyAddress.deleteMany({ where: { company: { document: companyDocument } } });
    await prisma.companyTeamMember.deleteMany({ where: { company: { document: companyDocument } } });
    await prisma.company.deleteMany({ where: { document: companyDocument } });
    await prisma.user.deleteMany({ where: { email: companyEmail } });

    await prisma.driverServiceType.deleteMany({
      where: { driver: { user: { email: { in: [driver1Email, driver2Email] } } } },
    });
    await prisma.driverPresenceLog.deleteMany({
      where: { driver: { user: { email: { in: [driver1Email, driver2Email] } } } },
    });
    await prisma.driver.deleteMany({ where: { user: { email: { in: [driver1Email, driver2Email] } } } });
    await prisma.user.deleteMany({ where: { email: { in: [driver1Email, driver2Email] } } });

    await app.close();
  });

  beforeEach(() => {
    realtime.emitToDriver.mockClear();
    realtime.emitAdminActivity.mockClear();
  });

  describe('fluxo feliz completo, endereço conhecido', () => {
    it('accept -> collect -> deliver fecha sozinho (COMPLETED) quando não exige retorno', async () => {
      await setAvailability(driver1Token, 'AVAILABLE');

      const created = await request(app.getHttpServer())
        .post('/deliveries')
        .set('Authorization', `Bearer ${companyToken}`)
        .send({ serviceTypeId, dropoffAddress: dropoff(1) })
        .expect(201);
      const deliveryId = created.body.id as string;

      const offer = await pendingOfferFor(deliveryId);
      await request(app.getHttpServer())
        .patch(`/delivery-offers/${offer.id}/accept`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryId}/collect`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);
      const afterCollect = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
      expect(afterCollect.status).toBe('COLLECTED');

      const delivered = await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryId}/deliver`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({})
        .expect(200);
      expect(delivered.body.status).toBe('COMPLETED');

      const history = await prisma.deliveryStatusHistory.findMany({
        where: { deliveryId },
        orderBy: { changedAt: 'asc' },
      });
      expect(history.map((h) => h.toStatus)).toEqual([
        'AWAITING_DRIVER',
        'ACCEPTED',
        'COLLECTED',
        'DELIVERED',
        'COMPLETED',
      ]);

      await setAvailability(driver1Token, 'UNAVAILABLE');
    });
  });

  describe('requiresReturn com endereço conhecido', () => {
    it('deliver fica em DELIVERED; completeReturn falha longe e fecha perto do endereço da empresa', async () => {
      await setAvailability(driver1Token, 'AVAILABLE');

      const created = await request(app.getHttpServer())
        .post('/deliveries')
        .set('Authorization', `Bearer ${companyToken}`)
        .send({ serviceTypeId, dropoffAddress: dropoff(2), requiresReturn: true })
        .expect(201);
      const deliveryId = created.body.id as string;

      const offer = await pendingOfferFor(deliveryId);
      await request(app.getHttpServer())
        .patch(`/delivery-offers/${offer.id}/accept`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryId}/collect`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);

      const delivered = await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryId}/deliver`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({})
        .expect(200);
      expect(delivered.body.status).toBe('DELIVERED');

      await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryId}/complete-return`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send(farFromPickup)
        .expect(409);

      const stillDelivered = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
      expect(stillDelivered.status).toBe('DELIVERED');

      const completed = await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryId}/complete-return`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send(nearPickup)
        .expect(200);
      expect(completed.body.deliveries).toHaveLength(1);
      expect(completed.body.deliveries[0].status).toBe('COMPLETED');

      await setAvailability(driver1Token, 'UNAVAILABLE');
    });
  });

  // O formulario do company-web cria pedido INDIVIDUAL, nao lote. Ate aqui so o lote sem
  // destino tinha prova ponta a ponta; o caminho que a tela realmente dispara so tinha
  // cobertura dos dois casos de recusa (endereco faltando / endereco indevido).
  describe('pedido individual sem destino conhecido', () => {
    it('nasce sem endereco e sem valor, e o preco aparece na entrega por GPS', async () => {
      await setAvailability(driver1Token, 'AVAILABLE');

      const criado = await request(app.getHttpServer())
        .post('/deliveries')
        .set('Authorization', `Bearer ${companyToken}`)
        .send({ serviceTypeId, destinationKnownAtCreation: false })
        .expect(201);

      const deliveryId = criado.body.id;
      expect(criado.body.totalValue).toBeNull();
      expect(criado.body.driverValue).toBeNull();
      expect(criado.body.distanceKm).toBeNull();

      // Nenhum DROPOFF ate a entrega: o pedido nao nasce meio definido.
      const semDropoff = await prisma.deliveryAddress.findFirst({
        where: { deliveryId, type: 'DROPOFF' },
      });
      expect(semDropoff).toBeNull();

      const offer = await pendingOfferFor(deliveryId);
      await request(app.getHttpServer())
        .patch(`/delivery-offers/${offer.id}/accept`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryId}/collect`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);

      const entregue = await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryId}/deliver`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({ lat: -20.16, lng: -41.75 })
        .expect(200);

      expect(entregue.body.status).toBe('COMPLETED');
      expect(entregue.body.totalValue).toBe(12.5);
      expect(entregue.body.distanceKm).toBe(5);

      const dropoff = await prisma.deliveryAddress.findFirstOrThrow({
        where: { deliveryId, type: 'DROPOFF' },
      });
      expect(dropoff.street).toBeNull();
      expect(Number(dropoff.lat)).toBeCloseTo(-20.16);

      await setAvailability(driver1Token, 'UNAVAILABLE');
    });
  });

  describe('lote sem destino conhecido', () => {
    it('nasce com valores nulos, despacha oferta com driverValue/distanceKm nulos, e cada item calcula o preço na entrega via GPS', async () => {
      await setAvailability(driver1Token, 'AVAILABLE');

      const batch = await request(app.getHttpServer())
        .post('/deliveries/batch')
        .set('Authorization', `Bearer ${companyToken}`)
        .send({
          deliveries: [
            { serviceTypeId, destinationKnownAtCreation: false },
            { serviceTypeId, destinationKnownAtCreation: false },
          ],
        })
        .expect(201);

      const deliveryIds = batch.body.deliveries.map((d: { id: string }) => d.id);
      for (const delivery of batch.body.deliveries) {
        expect(delivery.totalValue).toBeNull();
        expect(delivery.driverValue).toBeNull();
        expect(delivery.platformValue).toBeNull();
        expect(delivery.distanceKm).toBeNull();
      }

      expect(realtime.emitToDriver).toHaveBeenCalledWith(
        driver1Id,
        'delivery:offer',
        expect.objectContaining({ driverValue: null, distanceKm: null }),
      );

      const offer = await pendingOfferFor(deliveryIds[0]);
      await request(app.getHttpServer())
        .patch(`/delivery-offers/${offer.id}/accept`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryIds[0]}/collect`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);

      const delivered1 = await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryIds[0]}/deliver`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({ lat: -20.16, lng: -41.75 })
        .expect(200);
      expect(delivered1.body.status).toBe('COMPLETED');
      expect(delivered1.body.distanceKm).toBe(5);
      expect(delivered1.body.totalValue).toBe(12.5);
      expect(delivered1.body.driverValue).toBe(10);

      const dropoffAddress = await prisma.deliveryAddress.findFirstOrThrow({
        where: { deliveryId: deliveryIds[0], type: 'DROPOFF' },
      });
      expect(dropoffAddress.street).toBeNull();
      expect(Number(dropoffAddress.lat)).toBeCloseTo(-20.16);
      expect(Number(dropoffAddress.lng)).toBeCloseTo(-41.75);

      const delivered2 = await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryIds[1]}/deliver`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({ lat: -20.17, lng: -41.76 })
        .expect(200);
      expect(delivered2.body.status).toBe('COMPLETED');

      await setAvailability(driver1Token, 'UNAVAILABLE');
    });

    it('rejeita marcar entregue sem lat/lng quando o destino não é conhecido na criação', async () => {
      await setAvailability(driver1Token, 'AVAILABLE');

      const batch = await request(app.getHttpServer())
        .post('/deliveries/batch')
        .set('Authorization', `Bearer ${companyToken}`)
        .send({
          deliveries: [
            { serviceTypeId, destinationKnownAtCreation: false },
            { serviceTypeId, destinationKnownAtCreation: false },
          ],
        })
        .expect(201);
      const deliveryIds = batch.body.deliveries.map((d: { id: string }) => d.id);

      const offer = await pendingOfferFor(deliveryIds[0]);
      await request(app.getHttpServer())
        .patch(`/delivery-offers/${offer.id}/accept`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryIds[0]}/collect`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryIds[0]}/deliver`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({})
        .expect(409);

      await releaseAllDeliveries(deliveryIds);
      await setAvailability(driver1Token, 'UNAVAILABLE');
    });
  });

  describe('lote com requiresReturn misto', () => {
    it('item sem retorno fecha sozinho; item com retorno só fecha depois de completeReturn, sem afetar o outro', async () => {
      await setAvailability(driver1Token, 'AVAILABLE');

      const batch = await request(app.getHttpServer())
        .post('/deliveries/batch')
        .set('Authorization', `Bearer ${companyToken}`)
        .send({
          deliveries: [
            { serviceTypeId, dropoffAddress: dropoff(3), requiresReturn: false },
            { serviceTypeId, dropoffAddress: dropoff(4), requiresReturn: true },
          ],
        })
        .expect(201);
      const [noReturnId, withReturnId] = batch.body.deliveries.map((d: { id: string }) => d.id);

      const offer = await pendingOfferFor(noReturnId);
      await request(app.getHttpServer())
        .patch(`/delivery-offers/${offer.id}/accept`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/deliveries/${noReturnId}/collect`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);

      const deliveredNoReturn = await request(app.getHttpServer())
        .patch(`/deliveries/${noReturnId}/deliver`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({})
        .expect(200);
      expect(deliveredNoReturn.body.status).toBe('COMPLETED');

      const deliveredWithReturn = await request(app.getHttpServer())
        .patch(`/deliveries/${withReturnId}/deliver`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({})
        .expect(200);
      expect(deliveredWithReturn.body.status).toBe('DELIVERED');

      const completeReturnResponse = await request(app.getHttpServer())
        .patch(`/deliveries/${withReturnId}/complete-return`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send(nearPickup)
        .expect(200);
      expect(completeReturnResponse.body.deliveries).toHaveLength(1);
      expect(completeReturnResponse.body.deliveries[0].id).toBe(withReturnId);

      const finalNoReturn = await prisma.delivery.findUniqueOrThrow({ where: { id: noReturnId } });
      const finalWithReturn = await prisma.delivery.findUniqueOrThrow({ where: { id: withReturnId } });
      expect(finalNoReturn.status).toBe('COMPLETED');
      expect(finalWithReturn.status).toBe('COMPLETED');

      await setAvailability(driver1Token, 'UNAVAILABLE');
    });
  });

  describe('validações de criação (400)', () => {
    it('rejeita destinationKnownAtCreation padrão (true) sem dropoffAddress', async () => {
      await request(app.getHttpServer())
        .post('/deliveries')
        .set('Authorization', `Bearer ${companyToken}`)
        .send({ serviceTypeId })
        .expect(400);
    });

    it('rejeita destinationKnownAtCreation=false com dropoffAddress informado', async () => {
      await request(app.getHttpServer())
        .post('/deliveries')
        .set('Authorization', `Bearer ${companyToken}`)
        .send({ serviceTypeId, destinationKnownAtCreation: false, dropoffAddress: dropoff(5) })
        .expect(400);
    });

    it('rejeita lote misturando destinationKnownAtCreation entre os itens', async () => {
      await request(app.getHttpServer())
        .post('/deliveries/batch')
        .set('Authorization', `Bearer ${companyToken}`)
        .send({
          deliveries: [
            { serviceTypeId, dropoffAddress: dropoff(6) },
            { serviceTypeId, destinationKnownAtCreation: false },
          ],
        })
        .expect(400);
    });
  });

  describe('guardas e pré-condições de status', () => {
    it('empresa não pode chamar /collect (DriverOnlyGuard)', async () => {
      await request(app.getHttpServer())
        .patch('/deliveries/qualquer-id/collect')
        .set('Authorization', `Bearer ${companyToken}`)
        .expect(403);
    });

    it('motoboy não atribuído não pode coletar a entrega de outro motoboy', async () => {
      await setAvailability(driver1Token, 'AVAILABLE');

      const created = await request(app.getHttpServer())
        .post('/deliveries')
        .set('Authorization', `Bearer ${companyToken}`)
        .send({ serviceTypeId, dropoffAddress: dropoff(7) })
        .expect(201);
      const deliveryId = created.body.id as string;
      const offer = await pendingOfferFor(deliveryId);
      await request(app.getHttpServer())
        .patch(`/delivery-offers/${offer.id}/accept`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryId}/collect`)
        .set('Authorization', `Bearer ${driver2Token}`)
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryId}/collect`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);

      await releaseAllDeliveries([deliveryId]);
      await setAvailability(driver1Token, 'UNAVAILABLE');
    });

    it('rejeita /collect numa entrega que já está COLLECTED (409, não ACCEPTED)', async () => {
      await setAvailability(driver1Token, 'AVAILABLE');
      const created = await request(app.getHttpServer())
        .post('/deliveries')
        .set('Authorization', `Bearer ${companyToken}`)
        .send({ serviceTypeId, dropoffAddress: dropoff(8) })
        .expect(201);
      const deliveryId = created.body.id as string;
      const offer = await pendingOfferFor(deliveryId);
      await request(app.getHttpServer())
        .patch(`/delivery-offers/${offer.id}/accept`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryId}/collect`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryId}/collect`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(409);

      await releaseAllDeliveries([deliveryId]);
      await setAvailability(driver1Token, 'UNAVAILABLE');
    });

    it('rejeita /deliver numa entrega ainda não coletada (409)', async () => {
      await setAvailability(driver1Token, 'AVAILABLE');
      const created = await request(app.getHttpServer())
        .post('/deliveries')
        .set('Authorization', `Bearer ${companyToken}`)
        .send({ serviceTypeId, dropoffAddress: dropoff(9) })
        .expect(201);
      const deliveryId = created.body.id as string;
      const offer = await pendingOfferFor(deliveryId);
      await request(app.getHttpServer())
        .patch(`/delivery-offers/${offer.id}/accept`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryId}/deliver`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({})
        .expect(409);

      await releaseAllDeliveries([deliveryId]);
      await setAvailability(driver1Token, 'UNAVAILABLE');
    });
  });

  describe('regressão: cancel() com item já COMPLETED no lote', () => {
    it('admin consegue cancelar o item ainda ativo mesmo com outro item do lote já COMPLETED', async () => {
      await setAvailability(driver1Token, 'AVAILABLE');

      const batch = await request(app.getHttpServer())
        .post('/deliveries/batch')
        .set('Authorization', `Bearer ${companyToken}`)
        .send({
          deliveries: [
            { serviceTypeId, dropoffAddress: dropoff(10), requiresReturn: false },
            { serviceTypeId, dropoffAddress: dropoff(11), requiresReturn: false },
          ],
        })
        .expect(201);
      const [firstId, secondId] = batch.body.deliveries.map((d: { id: string }) => d.id);

      const offer = await pendingOfferFor(firstId);
      await request(app.getHttpServer())
        .patch(`/delivery-offers/${offer.id}/accept`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/deliveries/${firstId}/collect`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);

      const delivered = await request(app.getHttpServer())
        .patch(`/deliveries/${firstId}/deliver`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({})
        .expect(200);
      expect(delivered.body.status).toBe('COMPLETED');

      const cancelResponse = await request(app.getHttpServer())
        .patch(`/deliveries/${secondId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(cancelResponse.body.status).toBe('CANCELLED');

      const finalFirst = await prisma.delivery.findUniqueOrThrow({ where: { id: firstId } });
      expect(finalFirst.status).toBe('COMPLETED');

      await setAvailability(driver1Token, 'UNAVAILABLE');
    });
  });
});
