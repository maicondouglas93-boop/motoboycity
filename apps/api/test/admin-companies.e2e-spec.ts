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
const adminCreatedEmail = `teste.admin.companies.created.${uniqueSuffix}@example.com`;
const adminCreatedDocument = `9988776${String(uniqueSuffix).slice(-4)}`;
const adminCreatedPassword = 'senhaEmpresa456';
const changedCompanyPassword = 'senhaEmpresaNova789';
const invalidConfigEmail = `teste.admin.companies.invalid.${uniqueSuffix}@example.com`;
const invalidConfigDocument = `8877665${String(uniqueSuffix).slice(-4)}`;

const adminEmail = process.env['ADMIN_SEED_EMAIL'] ?? 'admin@motoboycity.local';
const adminPassword = process.env['ADMIN_SEED_PASSWORD'] ?? 'admin_dev_only_change_me';

describe('AdminCompaniesController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let companyId: string;
  let adminToken: string;
  let adminUserId: string;
  let companyOwnerToken: string;
  let adminCreatedCompanyId: string;
  let adminCreatedOwnerMemberId: string;

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
    adminUserId = adminLogin.body.user.id;

    const ownerLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: companyPassword });
    companyOwnerToken = ownerLogin.body.accessToken;
  });

  afterAll(async () => {
    const cleanupEmails = [testEmail, adminCreatedEmail, invalidConfigEmail];
    await prisma.companyTeamMember.deleteMany({
      where: { user: { email: { in: cleanupEmails } } },
    });
    await prisma.company.deleteMany({
      where: { document: { in: [testDocument, adminCreatedDocument, invalidConfigDocument] } },
    });
    await prisma.user.deleteMany({ where: { email: { in: cleanupEmails } } });
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

  it('protege opções e cadastro administrativo contra acesso não autorizado', async () => {
    const region = await prisma.region.findFirst({ where: { active: true }, select: { id: true } });
    expect(region).not.toBeNull();
    const payload = {
      name: 'Responsável criado pelo admin',
      email: adminCreatedEmail,
      phone: '33999887744',
      document: adminCreatedDocument,
      legalName: 'Empresa Admin E2E LTDA',
      tradeName: 'Empresa Admin E2E',
      password: adminCreatedPassword,
      regionId: region!.id,
    };

    await request(app.getHttpServer()).get('/admin/companies/registration-options').expect(401);
    await request(app.getHttpServer())
      .get('/admin/companies/registration-options')
      .set('Authorization', `Bearer ${companyOwnerToken}`)
      .expect(403);
    await request(app.getHttpServer()).post('/admin/companies').send(payload).expect(401);
    await request(app.getHttpServer())
      .post('/admin/companies')
      .set('Authorization', `Bearer ${companyOwnerToken}`)
      .send(payload)
      .expect(403);
  });

  it('admin cadastra empresa e responsável na região escolhida com status pendente', async () => {
    const region = await prisma.region.findFirst({ where: { active: true }, select: { id: true } });
    expect(region).not.toBeNull();

    const response = await request(app.getHttpServer())
      .post('/admin/companies')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Responsável criado pelo admin',
        email: adminCreatedEmail,
        phone: '33999887744',
        document: adminCreatedDocument,
        legalName: 'Empresa Admin E2E LTDA',
        tradeName: 'Empresa Admin E2E',
        password: adminCreatedPassword,
        regionId: region!.id,
      })
      .expect(201);

    expect(response.body).toEqual({
      companyId: expect.any(String),
      status: 'PENDING_APPROVAL',
    });
    adminCreatedCompanyId = response.body.companyId;

    const created = await prisma.company.findUnique({
      where: { id: adminCreatedCompanyId },
      include: { teamMembers: { include: { user: true } } },
    });
    expect(created).toMatchObject({ status: 'PENDING_APPROVAL', regionId: region!.id });
    expect(created?.teamMembers).toHaveLength(1);
    expect(created?.teamMembers[0]).toMatchObject({ role: 'OWNER', active: true });
    expect(created?.teamMembers[0]?.user.passwordHash).not.toBe(adminCreatedPassword);
    adminCreatedOwnerMemberId = created!.teamMembers[0]!.id;
  });

  it('não deixa usuário órfão quando a região escolhida não existe', async () => {
    await request(app.getHttpServer())
      .post('/admin/companies')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Responsável região inválida',
        email: invalidConfigEmail,
        phone: '33999887733',
        document: invalidConfigDocument,
        legalName: 'Empresa Região Inválida LTDA',
        tradeName: 'Empresa Região Inválida',
        password: adminCreatedPassword,
        regionId: '00000000-0000-0000-0000-000000000000',
      })
      .expect(409);

    await expect(
      prisma.user.findUnique({ where: { email: invalidConfigEmail } }),
    ).resolves.toBeNull();
    await expect(
      prisma.company.findUnique({ where: { document: invalidConfigDocument } }),
    ).resolves.toBeNull();
  });

  it('admin redefine a senha do responsável e revoga a sessão anterior', async () => {
    const oldLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminCreatedEmail, password: adminCreatedPassword })
      .expect(200);

    await request(app.getHttpServer())
      .patch(
        `/admin/companies/${adminCreatedCompanyId}/team-members/${adminCreatedOwnerMemberId}/password`,
      )
      .send({ password: changedCompanyPassword })
      .expect(401);
    await request(app.getHttpServer())
      .patch(
        `/admin/companies/${adminCreatedCompanyId}/team-members/${adminCreatedOwnerMemberId}/password`,
      )
      .set('Authorization', `Bearer ${oldLogin.body.accessToken}`)
      .send({ password: changedCompanyPassword })
      .expect(403);

    await request(app.getHttpServer())
      .patch(
        `/admin/companies/${adminCreatedCompanyId}/team-members/${adminCreatedOwnerMemberId}/password`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: changedCompanyPassword })
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ userId: expect.any(String) }));

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${oldLogin.body.accessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminCreatedEmail, password: adminCreatedPassword })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminCreatedEmail, password: changedCompanyPassword })
      .expect(200);
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

  it('admin aprova a empresa PENDING_APPROVAL com sucesso, gravando quem e quando', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/admin/companies/${companyId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toEqual({
      companyId,
      status: 'ACTIVE',
      approvedByUserId: adminUserId,
      approvedAt: expect.any(String),
    });

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    expect(company?.status).toBe('ACTIVE');
    expect(company?.approvedByUserId).toBe(adminUserId);
    expect(company?.approvedAt).toBeInstanceOf(Date);

    const listResponse = await request(app.getHttpServer())
      .get('/admin/companies')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const approvedCompany = (
      listResponse.body as Array<{ id: string; approvedBy: { id: string; name: string } | null }>
    ).find((c) => c.id === companyId);
    expect(approvedCompany?.approvedBy).toEqual(expect.objectContaining({ id: adminUserId }));
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
