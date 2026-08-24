import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

const uniqueSuffix = Date.now();
const testEmail = `teste.admin.drivers.${uniqueSuffix}@example.com`;
const testCpf = `333${String(uniqueSuffix).slice(-8)}`;
const driverPassword = 'senhaSegura123';
const adminCreatedEmail = `teste.admin.drivers.created.${uniqueSuffix}@example.com`;
const adminCreatedCpf = `555${String(uniqueSuffix).slice(-8)}`;
const adminCreatedPassword = 'senhaInicial456';
const invalidConfigEmail = `teste.admin.drivers.invalid.${uniqueSuffix}@example.com`;
const invalidConfigCpf = `666${String(uniqueSuffix).slice(-8)}`;

const adminEmail = process.env['ADMIN_SEED_EMAIL'] ?? 'admin@motoboycity.local';
const adminPassword = process.env['ADMIN_SEED_PASSWORD'] ?? 'admin_dev_only_change_me';

describe('AdminDriversController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let driverId: string;
  let adminToken: string;
  let adminUserId: string;
  let driverOwnToken: string;
  let adminCreatedDriverId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    await app.init();

    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register/driver')
      .send({
        name: 'Admin Drivers Teste E2E',
        email: testEmail,
        phone: '33999887766',
        cpf: testCpf,
        birthDate: '1990-05-20',
        pixKey: testEmail,
        pixKeyType: 'EMAIL',
        hasCnpj: false,
        password: driverPassword,
      });
    driverId = registerResponse.body.driverId;

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: adminPassword });
    adminToken = adminLogin.body.accessToken;
    adminUserId = adminLogin.body.user.id;

    const driverLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: driverPassword });
    driverOwnToken = driverLogin.body.accessToken;
  });

  afterAll(async () => {
    const cleanupEmails = [testEmail, adminCreatedEmail, invalidConfigEmail];
    const cleanupDrivers = await prisma.driver.findMany({
      where: { user: { email: { in: cleanupEmails } } },
      select: { id: true },
    });
    const cleanupDriverIds = cleanupDrivers.map(({ id }) => id);

    if (cleanupDriverIds.length > 0) {
      await prisma.driverServiceType.deleteMany({
        where: { driverId: { in: cleanupDriverIds } },
      });
    }
    await prisma.driver.deleteMany({ where: { id: { in: cleanupDriverIds } } });
    await prisma.user.deleteMany({ where: { email: { in: cleanupEmails } } });
    await app.close();
  });

  it('rejeita listagem sem token com 401', async () => {
    await request(app.getHttpServer()).get('/admin/drivers').expect(401);
  });

  it('rejeita listagem de um usuário não-admin com 403', async () => {
    await request(app.getHttpServer())
      .get('/admin/drivers')
      .set('Authorization', `Bearer ${driverOwnToken}`)
      .expect(403);
  });

  it('protege o cadastro administrativo contra acesso sem token ou de entregador', async () => {
    const [region, serviceType] = await Promise.all([
      prisma.region.findFirst({ where: { active: true }, select: { id: true } }),
      prisma.serviceType.findFirst({ where: { active: true }, select: { id: true } }),
    ]);
    expect(region).not.toBeNull();
    expect(serviceType).not.toBeNull();

    const payload = {
      name: 'Entregador cadastrado pelo admin',
      email: adminCreatedEmail,
      phone: '33999887744',
      cpf: adminCreatedCpf,
      birthDate: '1992-06-15',
      pixKey: adminCreatedEmail,
      pixKeyType: 'EMAIL',
      hasCnpj: false,
      password: adminCreatedPassword,
      regionId: region!.id,
      serviceTypeIds: [serviceType!.id],
    };

    await request(app.getHttpServer()).post('/admin/drivers').send(payload).expect(401);
    await request(app.getHttpServer())
      .post('/admin/drivers')
      .set('Authorization', `Bearer ${driverOwnToken}`)
      .send(payload)
      .expect(403);
    await request(app.getHttpServer()).get('/admin/drivers/registration-options').expect(401);
    await request(app.getHttpServer())
      .get('/admin/drivers/registration-options')
      .set('Authorization', `Bearer ${driverOwnToken}`)
      .expect(403);
  });

  it('admin consulta regiões ativas para preencher o cadastro', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/drivers/registration-options')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.regions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: expect.any(String), name: expect.any(String) }),
      ]),
    );
  });

  it('admin cria conta, perfil e modalidade em estado pendente numa única operação', async () => {
    const [region, serviceType] = await Promise.all([
      prisma.region.findFirst({ where: { active: true }, select: { id: true } }),
      prisma.serviceType.findFirst({ where: { active: true }, select: { id: true } }),
    ]);
    expect(region).not.toBeNull();
    expect(serviceType).not.toBeNull();

    const payload = {
      name: 'Entregador cadastrado pelo admin',
      email: adminCreatedEmail,
      phone: '33999887744',
      cpf: adminCreatedCpf,
      birthDate: '1992-06-15',
      pixKey: adminCreatedEmail,
      pixKeyType: 'EMAIL',
      hasCnpj: false,
      password: adminCreatedPassword,
      regionId: region!.id,
      serviceTypeIds: [serviceType!.id],
    };

    const response = await request(app.getHttpServer())
      .post('/admin/drivers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(201);

    expect(response.body).toEqual({
      driverId: expect.any(String),
      approvalStatus: 'PENDING',
    });
    adminCreatedDriverId = response.body.driverId;

    const created = await prisma.driver.findUnique({
      where: { id: response.body.driverId },
      include: { user: true, serviceTypes: true },
    });
    expect(created).toMatchObject({
      approvalStatus: 'PENDING',
      accountStatus: 'ACTIVE',
      availability: 'UNAVAILABLE',
      regionId: region!.id,
      serviceTypes: [{ serviceTypeId: serviceType!.id, isPrimary: true }],
    });
    expect(created?.user.passwordHash).not.toBe(adminCreatedPassword);
    await expect(
      bcrypt.compare(adminCreatedPassword, created?.user.passwordHash ?? ''),
    ).resolves.toBe(true);

    await request(app.getHttpServer())
      .post('/admin/drivers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(409);
  });

  it('não deixa resíduos quando a configuração operacional é inválida', async () => {
    const serviceType = await prisma.serviceType.findFirst({
      where: { active: true },
      select: { id: true },
    });
    expect(serviceType).not.toBeNull();

    await request(app.getHttpServer())
      .post('/admin/drivers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Entregador com configuração inválida',
        email: invalidConfigEmail,
        phone: '33999887733',
        cpf: invalidConfigCpf,
        birthDate: '1993-07-16',
        pixKey: invalidConfigEmail,
        pixKeyType: 'EMAIL',
        hasCnpj: false,
        password: adminCreatedPassword,
        regionId: '00000000-0000-4000-8000-000000000000',
        serviceTypeIds: [serviceType!.id],
      })
      .expect(409);

    await expect(
      prisma.user.findUnique({ where: { email: invalidConfigEmail } }),
    ).resolves.toBeNull();
  });

  it('admin lista os cadastros público e administrativo como PENDING e ACTIVE', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/drivers')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const listedDrivers = response.body as Array<{
      id: string;
      approvalStatus: string;
      accountStatus: string;
    }>;
    const publicRegistration = listedDrivers.find((driver) => driver.id === driverId);
    const adminRegistration = listedDrivers.find((driver) => driver.id === adminCreatedDriverId);

    expect(publicRegistration).toMatchObject({
      approvalStatus: 'PENDING',
      accountStatus: 'ACTIVE',
    });
    expect(adminRegistration).toMatchObject({
      approvalStatus: 'PENDING',
      accountStatus: 'ACTIVE',
    });
  });

  it('admin filtra a listagem por approvalStatus', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/drivers')
      .query({ approvalStatus: 'PENDING' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const statuses = (response.body as Array<{ approvalStatus: string }>).map(
      (d) => d.approvalStatus,
    );
    expect(statuses.every((status) => status === 'PENDING')).toBe(true);
  });

  it('rejeita suspender um motoboy que ainda não foi aprovado com 409', async () => {
    await request(app.getHttpServer())
      .patch(`/admin/drivers/${driverId}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);
  });

  it('admin aprova o motoboy PENDING, gravando quem e quando', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/admin/drivers/${driverId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toEqual({
      driverId,
      approvalStatus: 'APPROVED',
      reviewedByUserId: adminUserId,
      reviewedAt: expect.any(String),
    });

    const driver = await prisma.driver.findUnique({ where: { id: driverId } });
    expect(driver?.approvalStatus).toBe('APPROVED');
    expect(driver?.reviewedByUserId).toBe(adminUserId);
  });

  it('rejeita aprovar novamente um motoboy já APPROVED com 409', async () => {
    await request(app.getHttpServer())
      .patch(`/admin/drivers/${driverId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);
  });

  it('admin suspende o motoboy agora que está aprovado', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/admin/drivers/${driverId}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toEqual({ driverId, accountStatus: 'SUSPENDED' });
  });

  it('admin bloqueia o motoboy mesmo já estando suspenso', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/admin/drivers/${driverId}/block`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toEqual({ driverId, accountStatus: 'BLOCKED' });
  });

  it('admin reativa o motoboy de volta para ACTIVE', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/admin/drivers/${driverId}/reactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toEqual({ driverId, accountStatus: 'ACTIVE' });
  });

  it('retorna 404 para motoboy inexistente', async () => {
    await request(app.getHttpServer())
      .patch('/admin/drivers/00000000-0000-0000-0000-000000000000/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('admin rejeita um motoboy PENDING diferente, e o login dele passa a ser bloqueado', async () => {
    const rejectedEmail = `teste.admin.drivers.rejected.${uniqueSuffix}@example.com`;
    const rejectedCpf = `444${String(uniqueSuffix).slice(-8)}`;

    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register/driver')
      .send({
        name: 'Motoboy Rejeitado E2E',
        email: rejectedEmail,
        phone: '33999887755',
        cpf: rejectedCpf,
        birthDate: '1990-05-20',
        pixKey: rejectedEmail,
        pixKeyType: 'EMAIL',
        hasCnpj: false,
        password: driverPassword,
      });
    const rejectedDriverId = registerResponse.body.driverId;

    const response = await request(app.getHttpServer())
      .patch(`/admin/drivers/${rejectedDriverId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toEqual({
      driverId: rejectedDriverId,
      approvalStatus: 'REJECTED',
      reviewedByUserId: adminUserId,
      reviewedAt: expect.any(String),
    });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: rejectedEmail, password: driverPassword })
      .expect(403);

    await prisma.driver.deleteMany({ where: { user: { email: rejectedEmail } } });
    await prisma.user.deleteMany({ where: { email: rejectedEmail } });
  });
});
