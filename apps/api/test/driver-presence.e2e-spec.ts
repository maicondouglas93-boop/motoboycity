import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

const uniqueSuffix = Date.now();
const password = 'senhaSegura123';

const approvedEmail = `teste.presence.approved.${uniqueSuffix}@example.com`;
const approvedCpf = `881${String(uniqueSuffix).slice(-8)}`;
const pendingEmail = `teste.presence.pending.${uniqueSuffix}@example.com`;
const pendingCpf = `882${String(uniqueSuffix).slice(-8)}`;
const companyEmail = `teste.presence.company.${uniqueSuffix}@example.com`;
const companyDocument = `5001237${String(uniqueSuffix).slice(-4)}`;

const adminEmail = process.env['ADMIN_SEED_EMAIL'] ?? 'admin@motoboycity.local';
const adminPassword = process.env['ADMIN_SEED_PASSWORD'] ?? 'admin_dev_only_change_me';

describe('DriverPresenceController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let approvedToken: string;
  let pendingToken: string;
  let companyToken: string;
  const availablePayload = {
    availability: 'AVAILABLE',
    location: { lat: -20.153, lng: -41.622, accuracy: 8 },
    appVersion: 'e2e',
    trackingCapability: 'BACKGROUND_V1',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    await app.init();
    const server = app.getHttpServer();

    const adminLogin = await request(server)
      .post('/auth/login')
      .send({ email: adminEmail, password: adminPassword });
    const adminToken = adminLogin.body.accessToken;

    const approvedRegister = await request(server).post('/auth/register/driver').send({
      name: 'Motoboy Aprovado E2E',
      email: approvedEmail,
      phone: '33999887766',
      cpf: approvedCpf,
      birthDate: '1990-05-20',
      pixKey: approvedEmail,
      pixKeyType: 'EMAIL',
      hasCnpj: false,
      password,
    });
    await request(server)
      .patch(`/admin/drivers/${approvedRegister.body.driverId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    const approvedLogin = await request(server)
      .post('/auth/login')
      .send({ email: approvedEmail, password });
    approvedToken = approvedLogin.body.accessToken;

    await request(server).post('/auth/register/driver').send({
      name: 'Motoboy Pendente E2E',
      email: pendingEmail,
      phone: '33999887767',
      cpf: pendingCpf,
      birthDate: '1990-05-20',
      pixKey: pendingEmail,
      pixKeyType: 'EMAIL',
      hasCnpj: false,
      password,
    });
    const pendingLogin = await request(server)
      .post('/auth/login')
      .send({ email: pendingEmail, password });
    pendingToken = pendingLogin.body.accessToken;

    await request(server).post('/auth/register/company').send({
      name: 'Dono Presence E2E',
      email: companyEmail,
      phone: '33999887768',
      document: companyDocument,
      legalName: 'Presence E2E LTDA',
      tradeName: 'Presence E2E',
      password,
    });
    const companyLogin = await request(server)
      .post('/auth/login')
      .send({ email: companyEmail, password });
    companyToken = companyLogin.body.accessToken;
  });

  afterAll(async () => {
    await prisma.deliveryOffer.deleteMany({
      where: { driver: { user: { email: approvedEmail } } },
    });
    await prisma.driverPresenceLog.deleteMany({
      where: { driver: { user: { email: approvedEmail } } },
    });
    await prisma.driver.deleteMany({
      where: { user: { email: { in: [approvedEmail, pendingEmail] } } },
    });
    await prisma.user.deleteMany({ where: { email: { in: [approvedEmail, pendingEmail] } } });
    await prisma.companyTeamMember.deleteMany({ where: { user: { email: companyEmail } } });
    await prisma.company.deleteMany({ where: { document: companyDocument } });
    await prisma.user.deleteMany({ where: { email: companyEmail } });
    await app.close();
  });

  it('rejeita sem token com 401', async () => {
    await request(app.getHttpServer()).get('/driver/presence').expect(401);
  });

  it('rejeita empresa (não-motoboy) com 403', async () => {
    await request(app.getHttpServer())
      .get('/driver/presence')
      .set('Authorization', `Bearer ${companyToken}`)
      .expect(403);
  });

  it('estado inicial é UNAVAILABLE, since null', async () => {
    const response = await request(app.getHttpServer())
      .get('/driver/presence')
      .set('Authorization', `Bearer ${approvedToken}`)
      .expect(200);

    expect(response.body).toEqual({ availability: 'UNAVAILABLE', since: null, punishment: null });
  });

  it('rejeita motoboy PENDING tentando ficar disponível (403)', async () => {
    await request(app.getHttpServer())
      .put('/driver/presence')
      .set('Authorization', `Bearer ${pendingToken}`)
      .send(availablePayload)
      .expect(403);
  });

  it('motoboy aprovado fica disponível, since preenchido', async () => {
    const response = await request(app.getHttpServer())
      .put('/driver/presence')
      .set('Authorization', `Bearer ${approvedToken}`)
      .send(availablePayload)
      .expect(200);

    expect(response.body.availability).toBe('AVAILABLE');
    expect(response.body.since).toEqual(expect.any(String));
  });

  it('renova a sessão ao ficar disponível de novo', async () => {
    await request(app.getHttpServer())
      .put('/driver/presence')
      .set('Authorization', `Bearer ${approvedToken}`)
      .send(availablePayload)
      .expect(200);
  });

  it('aceita heartbeat enquanto disponível', async () => {
    const response = await request(app.getHttpServer())
      .post('/driver/presence/heartbeat')
      .set('Authorization', `Bearer ${approvedToken}`)
      .send({ lat: -20.154, lng: -41.623, accuracy: 9, appVersion: 'e2e' })
      .expect(201);

    expect(response.body.availability).toBe('AVAILABLE');
  });

  it('fica indisponível de novo, since volta a null', async () => {
    const response = await request(app.getHttpServer())
      .put('/driver/presence')
      .set('Authorization', `Bearer ${approvedToken}`)
      .send({ availability: 'UNAVAILABLE' })
      .expect(200);

    expect(response.body).toEqual({ availability: 'UNAVAILABLE', since: null, punishment: null });
  });
});
