import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { FinancialClock } from './../src/finance/financial-clock.service';
import { FinancialPayoutService } from './../src/finance/financial-payout.service';
import { InvoiceService } from './../src/finance/invoice.service';
import { GoogleMapsService } from './../src/maps/google-maps.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { RealtimeGateway } from './../src/realtime/realtime.gateway';
import { dateInSaoPaulo } from '../src/common/sao-paulo-time';

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

type RealtimeGatewayMock = {
  emitToDriver: jest.Mock;
  emitAdminActivity: jest.Mock;
  emitDeliveryUpdated: jest.Mock;
  emitDriverPresence: jest.Mock;
  emitDriverLocation: jest.Mock;
  emitDeliveryLocation: jest.Mock;
};

describe('Ciclo de vida da entrega — collect/deliver/completeReturn (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let realtime: RealtimeGatewayMock;
  let financialClock: FinancialClock;
  let financialPayoutService: FinancialPayoutService;
  let invoiceService: InvoiceService;

  let adminToken: string;
  let companyToken: string;
  let driver1Token: string;
  let driver1Id: string;
  let driver2Token: string;
  let driver2Id: string;
  let serviceTypeId: string;

  /**
   * `.expect(200)` de proposito: sem isso, um 429 do throttler ou qualquer
   * outra falha aqui passa em silencio, e o teste quebra bem mais adiante —
   * "nao ha oferta pendente" —, longe da causa real.
   */
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
      )
      .expect(200);
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
    realtime = moduleFixture.get(RealtimeGateway) as unknown as RealtimeGatewayMock;
    financialClock = moduleFixture.get(FinancialClock);
    financialPayoutService = moduleFixture.get(FinancialPayoutService);
    invoiceService = moduleFixture.get(InvoiceService);
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
        lat: pickupLat,
        lng: pickupLng,
      });

    async function registerApproveDriver(email: string, cpf: string) {
      const register = await request(server)
        .post('/auth/register/driver')
        .send({
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
    await prisma.invoiceStatusHistory.deleteMany({
      where: { invoice: { company: { document: companyDocument } } },
    });
    await prisma.invoice.deleteMany({ where: { company: { document: companyDocument } } });
    await prisma.withdrawalRequestStatusHistory.deleteMany({
      where: {
        withdrawalRequest: {
          wallet: { driver: { user: { email: { in: [driver1Email, driver2Email] } } } },
        },
      },
    });
    await prisma.withdrawalRequest.deleteMany({
      where: { wallet: { driver: { user: { email: { in: [driver1Email, driver2Email] } } } } },
    });
    await prisma.walletTransaction.deleteMany({
      where: { wallet: { driver: { user: { email: { in: [driver1Email, driver2Email] } } } } },
    });
    await prisma.wallet.deleteMany({
      where: { driver: { user: { email: { in: [driver1Email, driver2Email] } } } },
    });
    await prisma.pricingTable.deleteMany({ where: { serviceTypeId } });
    await prisma.driverServiceType.deleteMany({ where: { serviceTypeId } });
    await prisma.serviceType.deleteMany({ where: { code: serviceTypeCode } });

    await prisma.companyAddress.deleteMany({ where: { company: { document: companyDocument } } });
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

    await app.close();
  });

  beforeEach(() => {
    realtime.emitToDriver.mockClear();
    realtime.emitAdminActivity.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

      expect(realtime.emitToDriver).toHaveBeenCalledWith(
        driver1Id,
        'delivery:offer',
        expect.objectContaining({
          companyName: 'Lifecycle E2E',
          paymentMethod: 'BILLED',
          totalValue: 12.5,
          platformValue: 2.5,
          driverValue: 10,
          deliveries: [
            expect.objectContaining({
              deliveryId,
              serviceTypeName: expect.any(String),
              pickupAddress: expect.objectContaining({ street: 'Rua da Loja' }),
              dropoffAddress: expect.objectContaining({ street: 'Rua do Cliente 1' }),
            }),
          ],
        }),
      );

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

      const wallet = await request(app.getHttpServer())
        .get('/driver/wallet?status=PENDING')
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);
      expect(wallet.body.availableBalance).toBe(0);
      expect(wallet.body.blockedBalance).toBe(10);
      expect(wallet.body.transactions).toEqual([
        expect.objectContaining({
          type: 'CREDIT_REPASSE',
          status: 'PENDING',
          amount: 10,
          relatedDelivery: expect.objectContaining({ id: deliveryId }),
        }),
      ]);

      const financialOverview = await request(app.getHttpServer())
        .get('/admin/financial/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(financialOverview.body.completedDeliveries).toMatchObject({
        count: 1,
        totalValue: 12.5,
        driverValue: 10,
        platformValue: 2.5,
        unbilledValue: 12.5,
      });
      expect(financialOverview.body.driverWallets).toMatchObject({
        availableBalance: 0,
        blockedBalance: 10,
      });

      const driverWallets = await request(app.getHttpServer())
        .get('/admin/financial/driver-wallets?search=Lifecycle')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(driverWallets.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            driverId: driver1Id,
            blockedBalance: 10,
            cacheMatchesLedger: true,
          }),
        ]),
      );

      const adminDriverDetail = await request(app.getHttpServer())
        .get(`/admin/drivers/${driver1Id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(adminDriverDetail.body).toEqual(
        expect.objectContaining({
          id: driver1Id,
          email: driver1Email,
          approvalStatus: 'APPROVED',
          availability: expect.any(String),
        }),
      );

      const adminCompanyDetail = await request(app.getHttpServer())
        .get(`/admin/companies/${created.body.companyId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(adminCompanyDetail.body).toEqual(
        expect.objectContaining({
          id: created.body.companyId,
          region: expect.objectContaining({ name: expect.any(String) }),
          addresses: [expect.objectContaining({ isPrimary: true })],
          teamMembers: [expect.objectContaining({ role: 'OWNER', active: true })],
        }),
      );

      const adminWalletDetail = await request(app.getHttpServer())
        .get(`/admin/financial/driver-wallets/${driver1Id}?status=PENDING`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(adminWalletDetail.body).toEqual(
        expect.objectContaining({
          driverId: driver1Id,
          blockedBalance: 10,
          transactions: [
            expect.objectContaining({
              relatedDelivery: expect.objectContaining({
                id: deliveryId,
                displayNumber: created.body.displayNumber,
                companyName: 'Lifecycle E2E',
              }),
            }),
          ],
        }),
      );

      const scopedDeliveries = await request(app.getHttpServer())
        .get(`/deliveries?driverId=${driver1Id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(scopedDeliveries.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: deliveryId, paymentMethod: 'BILLED' }),
        ]),
      );

      const companyScopedDeliveries = await request(app.getHttpServer())
        .get(`/deliveries?companyId=${created.body.companyId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(companyScopedDeliveries.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: deliveryId })]),
      );

      await request(app.getHttpServer())
        .get(`/deliveries?driverId=${driver1Id}`)
        .set('Authorization', `Bearer ${companyToken}`)
        .expect(403);

      const detailedDelivery = await request(app.getHttpServer())
        .get(`/deliveries/${deliveryId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(detailedDelivery.body).toEqual(
        expect.objectContaining({
          driver: expect.objectContaining({ id: driver1Id, email: driver1Email }),
          statusHistory: expect.arrayContaining([
            expect.objectContaining({ toStatus: 'COMPLETED' }),
          ]),
        }),
      );

      // A data vem do relogio da operacao, e nao do UTC: entre 21h e meia-noite
      // em Lajinha ja e o dia seguinte em UTC, e o filtro pediria um dia em que
      // a entrega deste teste nao existe.
      const today = dateInSaoPaulo(new Date());
      const companyDeliveriesInPeriod = await request(app.getHttpServer())
        .get(`/deliveries?from=${today}&to=${today}`)
        .set('Authorization', `Bearer ${companyToken}`)
        .expect(200);
      expect(companyDeliveriesInPeriod.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: deliveryId })]),
      );

      const operationsReport = await request(app.getHttpServer())
        .get(`/admin/reports/operations?from=${today}&to=${today}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(operationsReport.body).toEqual(
        expect.objectContaining({
          period: { from: today, to: today },
          ordersCreated: expect.objectContaining({
            byCurrentStatus: expect.objectContaining({ COMPLETED: expect.any(Number) }),
          }),
          deliveriesCompleted: expect.objectContaining({ count: expect.any(Number) }),
          companies: expect.arrayContaining([
            expect.objectContaining({ companyId: created.body.companyId, completedCount: 1 }),
          ]),
          drivers: expect.arrayContaining([
            expect.objectContaining({ driverId: driver1Id, completedCount: 1, driverValue: 10 }),
          ]),
        }),
      );

      await request(app.getHttpServer())
        .get(`/admin/reports/operations?from=${today}&to=${today}`)
        .set('Authorization', `Bearer ${companyToken}`)
        .expect(403);

      const repasse = await prisma.walletTransaction.findUniqueOrThrow({
        where: { idempotencyKey: `driver-repasse:${deliveryId}` },
      });
      expect(repasse.releaseAt).not.toBeNull();
      const financialMonday = new Date(repasse.releaseAt!.getTime() + 5 * 60 * 1000);
      jest.spyOn(financialClock, 'now').mockReturnValue(financialMonday);

      await financialPayoutService.releaseDueRepasses(financialMonday);
      const releasedWallet = await request(app.getHttpServer())
        .get('/driver/wallet')
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);
      expect(releasedWallet.body).toMatchObject({
        availableBalance: 10,
        blockedBalance: 0,
        cacheMatchesLedger: true,
      });

      const withdrawal = await request(app.getHttpServer())
        .post('/driver/wallet/withdrawals')
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({ amount: 10 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/admin/financial/withdrawals/${withdrawal.body.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ note: 'Chave PIX conferida no caminho dourado.' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/admin/financial/withdrawals/${withdrawal.body.id}/mark-paid`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ note: 'PIX confirmado no caminho dourado.', paymentReference: 'GOLDEN-PATH-PIX' })
        .expect(201);

      const paidWallet = await request(app.getHttpServer())
        .get('/driver/wallet')
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);
      expect(paidWallet.body).toMatchObject({
        availableBalance: 0,
        blockedBalance: 0,
        pendingWithdrawalAmount: 0,
        cacheMatchesLedger: true,
      });
      expect(
        paidWallet.body.withdrawalRequests[0].statusHistory.map(
          (item: { toStatus: string }) => item.toStatus,
        ),
      ).toEqual(['PENDING', 'APPROVED', 'PAID']);

      const closedInvoices = await invoiceService.closeScheduledInvoices(financialMonday);
      const companyInvoice = closedInvoices.find(
        (invoice) => invoice.companyId === created.body.companyId,
      );
      expect(companyInvoice).toEqual(
        expect.objectContaining({ deliveryCount: 1, totalValue: 12.5, status: 'PENDING' }),
      );
      const closingDate = companyInvoice!.issueDate.slice(0, 10);

      await request(app.getHttpServer())
        .post('/admin/financial/invoices/close')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ issueDate: closingDate })
        .expect(201, []);

      const companyInvoicesForAdmin = await request(app.getHttpServer())
        .get(`/admin/financial/invoices?companyId=${created.body.companyId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(companyInvoicesForAdmin.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: companyInvoice!.id })]),
      );

      const companyInvoices = await request(app.getHttpServer())
        .get('/company/invoices')
        .set('Authorization', `Bearer ${companyToken}`)
        .expect(200);
      expect(companyInvoices.body).toEqual([
        expect.objectContaining({
          id: companyInvoice!.id,
          companyId: created.body.companyId,
        }),
      ]);

      const [firstPayment, duplicatePayment] = await Promise.all([
        request(app.getHttpServer())
          .patch(`/admin/financial/invoices/${companyInvoice!.id}/mark-paid`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ paymentDate: closingDate, paymentMethod: 'BILLED' }),
        request(app.getHttpServer())
          .patch(`/admin/financial/invoices/${companyInvoice!.id}/mark-paid`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ paymentDate: closingDate, paymentMethod: 'BILLED' }),
      ]);
      expect([firstPayment.status, duplicatePayment.status].sort()).toEqual([200, 409]);

      const paidInvoice = await request(app.getHttpServer())
        .get(`/admin/financial/invoices/${companyInvoice!.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(paidInvoice.body.status).toBe('PAID');
      expect(
        paidInvoice.body.statusHistory.map((item: { toStatus: string }) => item.toStatus),
      ).toEqual(['PENDING', 'PAID']);
      expect(paidInvoice.body.statusHistory[0]).toEqual(
        expect.objectContaining({
          changedBy: null,
          note: 'Fechamento automático semanal de 1 pedido(s).',
        }),
      );

      await setAvailability(driver1Token, 'UNAVAILABLE');
    });

    it('duas finalizações concorrentes criam exatamente um repasse', async () => {
      await setAvailability(driver1Token, 'AVAILABLE');

      const created = await request(app.getHttpServer())
        .post('/deliveries')
        .set('Authorization', `Bearer ${companyToken}`)
        .send({ serviceTypeId, dropoffAddress: dropoff(11) })
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

      const responses = await Promise.all([
        request(app.getHttpServer())
          .patch(`/deliveries/${deliveryId}/deliver`)
          .set('Authorization', `Bearer ${driver1Token}`)
          .send({}),
        request(app.getHttpServer())
          .patch(`/deliveries/${deliveryId}/deliver`)
          .set('Authorization', `Bearer ${driver1Token}`)
          .send({}),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);

      const repasses = await prisma.walletTransaction.findMany({
        where: { relatedDeliveryId: deliveryId, type: 'CREDIT_REPASSE' },
      });
      expect(repasses).toHaveLength(1);
      expect(Number(repasses[0]!.amount)).toBe(10);

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
        expect.objectContaining({
          totalValue: null,
          driverValue: null,
          platformValue: null,
          distanceKm: null,
          deliveries: expect.arrayContaining([
            expect.objectContaining({
              pickupAddress: expect.objectContaining({ street: 'Rua da Loja' }),
              dropoffAddress: null,
            }),
          ]),
        }),
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
      const finalWithReturn = await prisma.delivery.findUniqueOrThrow({
        where: { id: withReturnId },
      });
      expect(finalNoReturn.status).toBe('COMPLETED');
      expect(finalWithReturn.status).toBe('COMPLETED');

      await setAvailability(driver1Token, 'UNAVAILABLE');
    });
  });

  // A coordenada da entrega sem destino vira o destino E o preco. Um fix impreciso nao
  // "erra um pouco": grava um destino que nunca existiu e um valor que ninguem contesta
  // depois, porque o pedido fecha COMPLETED com esse numero.
  describe('precisao do GPS', () => {
    it('recusa marcar entregue com fix impreciso demais para definir o destino', async () => {
      await setAvailability(driver1Token, 'AVAILABLE');

      const criado = await request(app.getHttpServer())
        .post('/deliveries')
        .set('Authorization', `Bearer ${companyToken}`)
        .send({ serviceTypeId, destinationKnownAtCreation: false })
        .expect(201);
      const deliveryId = criado.body.id;

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
        .patch(`/deliveries/${deliveryId}/deliver`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({ lat: -20.16, lng: -41.75, accuracy: 350 })
        .expect(409);

      // Nada foi gravado: sem destino, sem preco, e a entrega segue coletada.
      const aindaColetada = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
      expect(aindaColetada.status).toBe('COLLECTED');
      expect(aindaColetada.totalValue).toBeNull();

      // Com o sinal bom, a mesma entrega fecha normalmente.
      const entregue = await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryId}/deliver`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({ lat: -20.16, lng: -41.75, accuracy: 12 })
        .expect(200);
      expect(entregue.body.status).toBe('COMPLETED');
      expect(entregue.body.totalValue).toBe(12.5);

      await setAvailability(driver1Token, 'UNAVAILABLE');
    });

    it('recusa fechar retorno quando a precisao e maior que o raio aceito', async () => {
      await setAvailability(driver1Token, 'AVAILABLE');

      const criado = await request(app.getHttpServer())
        .post('/deliveries')
        .set('Authorization', `Bearer ${companyToken}`)
        .send({ serviceTypeId, dropoffAddress: dropoff(9), requiresReturn: true })
        .expect(201);
      const deliveryId = criado.body.id;

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
        .patch(`/deliveries/${deliveryId}/deliver`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({})
        .expect(200);

      // Raio configurado no setup: 100 m. Precisao de 500 m tornaria a checagem vazia —
      // "estou na loja" seria verdade em qualquer lugar do bairro.
      await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryId}/complete-return`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({ ...nearPickup, accuracy: 500 })
        .expect(409);

      const aindaEntregue = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
      expect(aindaEntregue.status).toBe('DELIVERED');

      await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryId}/complete-return`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({ ...nearPickup, accuracy: 15 })
        .expect(200);

      await setAvailability(driver1Token, 'UNAVAILABLE');
    });
  });

  describe('insucesso de entrega', () => {
    it('coletou e nao entregou: volta para a loja, fecha COMPLETED e paga a corrida normal', async () => {
      await setAvailability(driver1Token, 'AVAILABLE');

      const created = await request(app.getHttpServer())
        .post('/deliveries')
        .set('Authorization', `Bearer ${companyToken}`)
        // Sem retorno pedido: mesmo assim a mercadoria tem de voltar.
        .send({ serviceTypeId, dropoffAddress: dropoff(1), requiresReturn: false })
        .expect(201);
      const deliveryId = created.body.id as string;
      const valorCombinado = created.body.driverValue as number;

      const offer = await pendingOfferFor(deliveryId);
      await request(app.getHttpServer())
        .patch(`/delivery-offers/${offer.id}/accept`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);

      // Antes de coletar nao ha mercadoria em posse: insucesso nao se aplica.
      await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryId}/fail`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({ reason: 'RECIPIENT_ABSENT', lat: -20.1385, lng: -41.7415 })
        .expect(409);

      await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryId}/collect`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .expect(200);

      // "Outro" sem descricao e recusado pela validacao.
      await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryId}/fail`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({ reason: 'OTHER', lat: -20.1385, lng: -41.7415 })
        .expect(400);

      const falhou = await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryId}/fail`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({
          reason: 'RECIPIENT_ABSENT',
          note: 'Tocou a campainha tres vezes, ninguem atendeu.',
          lat: -20.1385,
          lng: -41.7415,
          accuracy: 9,
        })
        .expect(200);
      expect(falhou.body.status).toBe('FAILED');

      // Nada foi creditado ainda: o pedido nao fechou.
      const semCredito = await prisma.walletTransaction.count({
        where: { relatedDeliveryId: deliveryId, type: 'CREDIT_REPASSE' },
      });
      expect(semCredito).toBe(0);

      // Longe da loja o retorno nao fecha.
      await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryId}/complete-return`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({ ...farFromPickup, accuracy: 8 })
        .expect(409);

      // Na porta da loja, fecha.
      const fechado = await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryId}/complete-return`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({ ...nearPickup, accuracy: 8 })
        .expect(200);
      expect(fechado.body.deliveries[0].status).toBe('COMPLETED');

      // A regra do negocio: a empresa paga a corrida normal, e o motoboy
      // recebe o mesmo valor que receberia numa entrega bem-sucedida.
      const credito = await prisma.walletTransaction.findFirstOrThrow({
        where: { relatedDeliveryId: deliveryId, type: 'CREDIT_REPASSE' },
      });
      expect(Number(credito.amount)).toBe(valorCombinado);

      // A trilha registra o caminho real, nao um cancelamento.
      const detalhe = await request(app.getHttpServer())
        .get(`/deliveries/${deliveryId}`)
        .set('Authorization', `Bearer ${companyToken}`)
        .expect(200);
      expect(
        detalhe.body.statusHistory.map((entry: { toStatus: string }) => entry.toStatus),
      ).toEqual(['AWAITING_DRIVER', 'ACCEPTED', 'COLLECTED', 'FAILED', 'COMPLETED']);

      await releaseAllDeliveries([deliveryId]);
      await setAvailability(driver1Token, 'UNAVAILABLE');
    });
  });

  describe('tempo por etapa (stage-times)', () => {
    it('deriva as etapas do historico e respeita o escopo de cada perfil', async () => {
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
      await request(app.getHttpServer())
        .patch(`/deliveries/${deliveryId}/deliver`)
        .set('Authorization', `Bearer ${driver1Token}`)
        .send({ lat: -20.1385, lng: -41.7415, accuracy: 8 })
        .expect(200);

      const asCompany = await request(app.getHttpServer())
        .get('/deliveries/stage-times')
        .set('Authorization', `Bearer ${companyToken}`)
        .expect(200);

      // O ciclo inteiro roda em milissegundos no teste, entao o que se prova
      // aqui e que as etapas foram DERIVADAS do historico — nao a duracao.
      for (const stage of ['aceite', 'coleta', 'entrega', 'total'] as const) {
        expect(asCompany.body[stage].samples).toBeGreaterThanOrEqual(1);
        expect(asCompany.body[stage].averageMinutes).not.toBeNull();
        expect(asCompany.body[stage].medianMinutes).not.toBeNull();
        expect(asCompany.body[stage].p90Minutes).not.toBeNull();
        expect(asCompany.body[stage].averageMinutes).toBeGreaterThanOrEqual(0);
      }

      // Admin enxerga pelo menos o mesmo volume que a empresa.
      const asAdmin = await request(app.getHttpServer())
        .get('/deliveries/stage-times')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(asAdmin.body.total.samples).toBeGreaterThanOrEqual(
        asCompany.body.total.samples as number,
      );

      // Empresa nao pode ampliar o proprio escopo por querystring.
      await request(app.getHttpServer())
        .get('/deliveries/stage-times?companyId=00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${companyToken}`)
        .expect(403);

      // Periodo invertido e recusado pela validacao.
      await request(app.getHttpServer())
        .get('/deliveries/stage-times?from=2026-09-01&to=2026-08-01')
        .set('Authorization', `Bearer ${companyToken}`)
        .expect(400);

      // Janela sem pedido nenhum devolve zero, nao numero inventado.
      const vazio = await request(app.getHttpServer())
        .get('/deliveries/stage-times?from=2020-01-01&to=2020-01-02')
        .set('Authorization', `Bearer ${companyToken}`)
        .expect(200);
      expect(vazio.body.total).toEqual({
        samples: 0,
        averageMinutes: null,
        medianMinutes: null,
        p90Minutes: null,
      });

      await releaseAllDeliveries([deliveryId]);
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
