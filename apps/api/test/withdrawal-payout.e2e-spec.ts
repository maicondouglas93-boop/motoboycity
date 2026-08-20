import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { FinancialClock } from '../src/finance/financial-clock.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RealtimeGateway } from '../src/realtime/realtime.gateway';

const uniqueSuffix = Date.now();
const password = 'senhaSegura123';
const driverEmail = `teste.withdrawal.driver.${uniqueSuffix}@example.com`;
const driverCpf = `993${String(uniqueSuffix).slice(-8)}`;
const adminEmail = process.env['ADMIN_SEED_EMAIL'] ?? 'admin@motoboycity.local';
const adminPassword = process.env['ADMIN_SEED_PASSWORD'] ?? 'admin_dev_only_change_me';

describe('Saques do motoboy — reserva, aprovação e pagamento (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let clock: FinancialClock;
  let clockSpy: jest.SpyInstance<Date, []>;
  let adminToken: string;
  let driverToken: string;
  let driverId: string;
  let walletId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RealtimeGateway)
      .useValue({ emitToDriver: jest.fn(), emitAdminActivity: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    clock = moduleFixture.get(FinancialClock);
    await app.init();

    const server = app.getHttpServer();
    const adminLogin = await request(server)
      .post('/auth/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);
    adminToken = adminLogin.body.accessToken;

    const driverRegister = await request(server)
      .post('/auth/register/driver')
      .send({
        name: 'Motoboy Saque E2E',
        email: driverEmail,
        phone: '33999887711',
        cpf: driverCpf,
        birthDate: '1990-05-20',
        pixKey: driverEmail,
        pixKeyType: 'EMAIL',
        hasCnpj: false,
        password,
      })
      .expect(201);
    driverId = driverRegister.body.driverId;
    await request(server)
      .patch(`/admin/drivers/${driverId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const driverLogin = await request(server)
      .post('/auth/login')
      .send({ email: driverEmail, password })
      .expect(200);
    driverToken = driverLogin.body.accessToken;

    const wallet = await prisma.wallet.create({
      data: {
        driverId,
        cachedAvailableBalance: 50,
        transactions: {
          create: { type: 'CREDIT_REPASSE', status: 'RELEASED', amount: 50 },
        },
      },
    });
    walletId = wallet.id;
    clockSpy = jest.spyOn(clock, 'now').mockReturnValue(new Date('2026-08-24T12:00:00.000Z'));
  });

  afterAll(async () => {
    clockSpy?.mockRestore();
    if (walletId) {
      await prisma.withdrawalRequestStatusHistory.deleteMany({
        where: { withdrawalRequest: { walletId } },
      });
      await prisma.withdrawalRequest.deleteMany({ where: { walletId } });
      await prisma.walletTransaction.deleteMany({ where: { walletId } });
      await prisma.wallet.deleteMany({ where: { id: walletId } });
    }
    if (driverId) {
      await prisma.driverPresenceLog.deleteMany({ where: { driverId } });
      await prisma.driver.deleteMany({ where: { id: driverId } });
    }
    await prisma.user.deleteMany({ where: { email: driverEmail } });
    await app?.close();
  });

  it('reserva uma única solicitação concorrente, aprova e registra o pagamento com histórico', async () => {
    const server = app.getHttpServer();
    const attempts = await Promise.all([
      request(server)
        .post('/driver/wallet/withdrawals')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ amount: 50 }),
      request(server)
        .post('/driver/wallet/withdrawals')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ amount: 50 }),
    ]);
    expect(attempts.map((response) => response.status).sort()).toEqual([201, 422]);
    const created = attempts.find((response) => response.status === 201);
    const withdrawalId = created?.body.id as string;

    const walletAfterRequest = await request(server)
      .get('/driver/wallet')
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    expect(walletAfterRequest.body).toMatchObject({
      availableBalance: 0,
      blockedBalance: 0,
      pendingWithdrawalAmount: 50,
      cacheMatchesLedger: true,
    });
    expect(walletAfterRequest.body.withdrawalRequests).toEqual([
      expect.objectContaining({ id: withdrawalId, status: 'PENDING', feeAmount: 0, netAmount: 50 }),
    ]);

    const approvals = await Promise.all([
      request(server)
        .post(`/admin/financial/withdrawals/${withdrawalId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ note: 'Dados PIX conferidos.' }),
      request(server)
        .post(`/admin/financial/withdrawals/${withdrawalId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ note: 'Dados PIX conferidos.' }),
    ]);
    expect(approvals.map((response) => response.status).sort()).toEqual([201, 409]);

    const payments = await Promise.all([
      request(server)
        .post(`/admin/financial/withdrawals/${withdrawalId}/mark-paid`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ note: 'PIX enviado.', paymentReference: 'E2E-PIX-001' }),
      request(server)
        .post(`/admin/financial/withdrawals/${withdrawalId}/mark-paid`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ note: 'PIX enviado.', paymentReference: 'E2E-PIX-001' }),
    ]);
    expect(payments.map((response) => response.status).sort()).toEqual([201, 409]);

    const detail = await request(server)
      .get(`/admin/financial/withdrawals/${withdrawalId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(detail.body).toMatchObject({
      status: 'PAID',
      paymentReference: 'E2E-PIX-001',
      pixKey: driverEmail,
    });
    expect(detail.body.statusHistory.map((entry: { toStatus: string }) => entry.toStatus)).toEqual([
      'PENDING',
      'APPROVED',
      'PAID',
    ]);

    const walletAfterPayment = await request(server)
      .get('/driver/wallet')
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    expect(walletAfterPayment.body).toMatchObject({
      availableBalance: 0,
      pendingWithdrawalAmount: 0,
      cacheMatchesLedger: true,
    });
  });

  it('devolve o saldo quando o administrador rejeita uma solicitação pendente', async () => {
    await prisma.$transaction([
      prisma.walletTransaction.create({
        data: { walletId, type: 'CREDIT_REPASSE', status: 'RELEASED', amount: 20 },
      }),
      prisma.wallet.update({
        where: { id: walletId },
        data: { cachedAvailableBalance: { increment: 20 } },
      }),
    ]);
    const server = app.getHttpServer();
    const created = await request(server)
      .post('/driver/wallet/withdrawals')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ amount: 10 })
      .expect(201);

    await request(server)
      .post(`/admin/financial/withdrawals/${created.body.id}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'Chave PIX precisa ser atualizada.' })
      .expect(201);

    const wallet = await request(server)
      .get('/driver/wallet')
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    expect(wallet.body).toMatchObject({
      availableBalance: 20,
      pendingWithdrawalAmount: 0,
      cacheMatchesLedger: true,
    });
    const rejected = wallet.body.withdrawalRequests.find(
      (entry: { id: string }) => entry.id === created.body.id,
    );
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.statusHistory.map((entry: { toStatus: string }) => entry.toStatus)).toEqual([
      'PENDING',
      'REJECTED',
    ]);
  });
});
