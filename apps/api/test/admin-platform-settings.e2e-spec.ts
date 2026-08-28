import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

const adminEmail = process.env['ADMIN_SEED_EMAIL'] ?? 'admin@motoboycity.local';
const adminPassword = process.env['ADMIN_SEED_PASSWORD'] ?? 'admin_dev_only_change_me';

describe('AdminPlatformSettingsController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let adminUserId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    await app.init();

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: adminPassword });
    adminToken = adminLogin.body.accessToken;
    adminUserId = adminLogin.body.user.id;

    // PlatformSettings é uma linha global única (id: 'global'), compartilhada
    // por toda a suíte e2e. Este arquivo assume um estado "nunca configurado"
    // pra testar o fluxo de primeira configuração, então precisa garantir
    // isso mesmo se outro arquivo e2e já rodou antes na mesma sessão.
    await prisma.platformSettings.deleteMany({ where: { id: 'global' } });
  });

  afterAll(async () => {
    await prisma.platformSettings.deleteMany({ where: { id: 'global' } });
    await app.close();
  });

  it('rejeita leitura sem token com 401', async () => {
    await request(app.getHttpServer()).get('/admin/platform-settings').expect(401);
  });

  it('rejeita valor de comissão fora do intervalo 0-100 com 400', async () => {
    await request(app.getHttpServer())
      .patch('/admin/platform-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ driverCommissionPercentage: 150 })
      .expect(400);
  });

  it('rejeita corpo vazio com 400', async () => {
    await request(app.getHttpServer())
      .patch('/admin/platform-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(400);
  });

  it('rejeita timeout de despacho fora do intervalo 10-600 com 400', async () => {
    await request(app.getHttpServer())
      .patch('/admin/platform-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ dispatchOfferTimeoutSeconds: 5 })
      .expect(400);
  });

  it('admin configura a comissão pela primeira vez, gravando quem e quando', async () => {
    const response = await request(app.getHttpServer())
      .patch('/admin/platform-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ driverCommissionPercentage: 80 })
      .expect(200);

    expect(response.body).toEqual({
      driverCommissionPercentage: 80,
      dispatchOfferTimeoutSeconds: null,
      pickupAssignmentTimeoutMinutes: null,
      returnProximityRadiusMeters: null,
      businessHoursEnabled: false,
      minMinutesBeforeCollect: null,
      minMinutesBeforeDeliver: null,
      locationSilenceAlertMinutes: null,
      slaAlertMinutesToAccept: null,
      slaAlertMinutesToCollect: null,
      slaAlertMinutesToDeliver: null,
      maxConcurrentDeliveriesPerDriver: null,
      maxDeliveriesPerBatch: null,
      deliveryProximityRadiusMeters: null,
      updatedBy: { id: adminUserId, name: expect.any(String) },
      updatedAt: expect.any(String),
    });
  });

  it('admin configura o timeout de despacho separadamente, sem mexer na comissão já salva', async () => {
    const response = await request(app.getHttpServer())
      .patch('/admin/platform-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ dispatchOfferTimeoutSeconds: 60 })
      .expect(200);

    expect(response.body).toEqual({
      driverCommissionPercentage: 80,
      dispatchOfferTimeoutSeconds: 60,
      pickupAssignmentTimeoutMinutes: null,
      returnProximityRadiusMeters: null,
      businessHoursEnabled: false,
      minMinutesBeforeCollect: null,
      minMinutesBeforeDeliver: null,
      locationSilenceAlertMinutes: null,
      slaAlertMinutesToAccept: null,
      slaAlertMinutesToCollect: null,
      slaAlertMinutesToDeliver: null,
      maxConcurrentDeliveriesPerDriver: null,
      maxDeliveriesPerBatch: null,
      deliveryProximityRadiusMeters: null,
      updatedBy: { id: adminUserId, name: expect.any(String) },
      updatedAt: expect.any(String),
    });
  });

  it('rejeita raio de retorno fora do intervalo 10-2000 com 400', async () => {
    await request(app.getHttpServer())
      .patch('/admin/platform-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ returnProximityRadiusMeters: 5000 })
      .expect(400);
  });

  it('admin configura o raio de retorno separadamente, sem mexer nos outros campos', async () => {
    const response = await request(app.getHttpServer())
      .patch('/admin/platform-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ returnProximityRadiusMeters: 150 })
      .expect(200);

    expect(response.body).toEqual({
      driverCommissionPercentage: 80,
      dispatchOfferTimeoutSeconds: 60,
      pickupAssignmentTimeoutMinutes: null,
      returnProximityRadiusMeters: 150,
      businessHoursEnabled: false,
      minMinutesBeforeCollect: null,
      minMinutesBeforeDeliver: null,
      locationSilenceAlertMinutes: null,
      slaAlertMinutesToAccept: null,
      slaAlertMinutesToCollect: null,
      slaAlertMinutesToDeliver: null,
      maxConcurrentDeliveriesPerDriver: null,
      maxDeliveriesPerBatch: null,
      deliveryProximityRadiusMeters: null,
      updatedBy: { id: adminUserId, name: expect.any(String) },
      updatedAt: expect.any(String),
    });
  });

  it('GET reflete os valores configurados', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/platform-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.driverCommissionPercentage).toBe(80);
    expect(response.body.dispatchOfferTimeoutSeconds).toBe(60);
  });

  it('admin atualiza a comissão existente (upsert vira update)', async () => {
    const response = await request(app.getHttpServer())
      .patch('/admin/platform-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ driverCommissionPercentage: 70 })
      .expect(200);

    expect(response.body.driverCommissionPercentage).toBe(70);
    expect(response.body.dispatchOfferTimeoutSeconds).toBe(60);
  });
});
