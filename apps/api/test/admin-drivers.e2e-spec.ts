import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

const uniqueSuffix = Date.now();
const testEmail = `teste.admin.drivers.${uniqueSuffix}@example.com`;
const testCpf = `333${String(uniqueSuffix).slice(-8)}`;
const driverPassword = 'senhaSegura123';

const adminEmail = process.env['ADMIN_SEED_EMAIL'] ?? 'admin@motoboycity.local';
const adminPassword = process.env['ADMIN_SEED_PASSWORD'] ?? 'admin_dev_only_change_me';

describe('AdminDriversController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let driverId: string;
  let adminToken: string;
  let adminUserId: string;
  let driverOwnToken: string;

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
    await prisma.driver.deleteMany({ where: { user: { email: testEmail } } });
    await prisma.user.deleteMany({ where: { email: testEmail } });
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

  it('admin lista motoboys, incluindo o recém-criado com approvalStatus PENDING', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/drivers')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const found = (
      response.body as Array<{ id: string; approvalStatus: string; accountStatus: string }>
    ).find((driver) => driver.id === driverId);
    expect(found).toBeDefined();
    expect(found?.approvalStatus).toBe('PENDING');
    expect(found?.accountStatus).toBe('ACTIVE');
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
