import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

const uniqueSuffix = Date.now();
const testEmail = `teste.approve.${uniqueSuffix}@example.com`;
const testDocument = `1122334${String(uniqueSuffix).slice(-4)}`;
const companyPassword = 'senhaSegura123';

const adminEmail = process.env['ADMIN_SEED_EMAIL'] ?? 'admin@motoboycity.local';
const adminPassword = process.env['ADMIN_SEED_PASSWORD'] ?? 'admin_dev_only_change_me';

describe('AdminCompaniesController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let companyId: string;
  let adminToken: string;
  let companyOwnerToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    await app.init();

    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register/company')
      .send({
        name: 'Approve Teste E2E',
        email: testEmail,
        phone: '33999887766',
        document: testDocument,
        legalName: 'Approve Teste E2E LTDA',
        tradeName: 'Approve Teste E2E',
        password: companyPassword,
      });
    companyId = registerResponse.body.companyId;

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: adminPassword });
    adminToken = adminLogin.body.accessToken;

    const ownerLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: companyPassword });
    companyOwnerToken = ownerLogin.body.accessToken;
  });

  afterAll(async () => {
    await prisma.companyTeamMember.deleteMany({ where: { user: { email: testEmail } } });
    await prisma.company.deleteMany({ where: { document: testDocument } });
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await app.close();
  });

  it('rejeita listagem sem token com 401', async () => {
    await request(app.getHttpServer()).get('/admin/companies').expect(401);
  });

  it('rejeita listagem de um usuário não-admin com 403', async () => {
    await request(app.getHttpServer())
      .get('/admin/companies')
      .set('Authorization', `Bearer ${companyOwnerToken}`)
      .expect(403);
  });

  it('admin lista empresas, incluindo a empresa recém-criada com status PENDING_APPROVAL', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/companies')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const found = (response.body as Array<{ id: string; status: string; owner: unknown }>).find(
      (company) => company.id === companyId,
    );
    expect(found).toBeDefined();
    expect(found?.status).toBe('PENDING_APPROVAL');
    expect(found?.owner).toEqual(
      expect.objectContaining({ name: 'Approve Teste E2E', email: testEmail }),
    );
  });

  it('admin filtra a listagem por status', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/companies')
      .query({ status: 'PENDING_APPROVAL' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const statuses = (response.body as Array<{ status: string }>).map((c) => c.status);
    expect(statuses.every((status) => status === 'PENDING_APPROVAL')).toBe(true);
  });

  it('rejeita filtro de status inválido com 400', async () => {
    await request(app.getHttpServer())
      .get('/admin/companies')
      .query({ status: 'NAO_EXISTE' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('rejeita aprovação sem token com 401', async () => {
    await request(app.getHttpServer()).patch(`/admin/companies/${companyId}/approve`).expect(401);
  });

  it('rejeita aprovação de um usuário não-admin com 403', async () => {
    await request(app.getHttpServer())
      .patch(`/admin/companies/${companyId}/approve`)
      .set('Authorization', `Bearer ${companyOwnerToken}`)
      .expect(403);
  });

  it('admin aprova a empresa PENDING_APPROVAL com sucesso', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/admin/companies/${companyId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toEqual({ companyId, status: 'ACTIVE' });

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    expect(company?.status).toBe('ACTIVE');
  });

  it('rejeita aprovar novamente uma empresa já ACTIVE com 409', async () => {
    await request(app.getHttpServer())
      .patch(`/admin/companies/${companyId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);
  });

  it('retorna 404 para empresa inexistente', async () => {
    await request(app.getHttpServer())
      .patch('/admin/companies/00000000-0000-0000-0000-000000000000/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
