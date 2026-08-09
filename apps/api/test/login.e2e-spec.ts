import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

const uniqueSuffix = Date.now();
const testEmail = `teste.login.${uniqueSuffix}@example.com`;
const testDocument = `9876543${String(uniqueSuffix).slice(-4)}`;
const testPassword = 'senhaSegura123';

const registerPayload = {
  name: 'Login Teste E2E',
  email: testEmail,
  phone: '33999887766',
  document: testDocument,
  legalName: 'Login Teste E2E LTDA',
  tradeName: 'Login Teste E2E',
  password: testPassword,
};

describe('Login (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    await app.init();

    await request(app.getHttpServer()).post('/auth/register/company').send(registerPayload);
  });

  afterAll(async () => {
    await prisma.companyTeamMember.deleteMany({ where: { user: { email: testEmail } } });
    await prisma.company.deleteMany({ where: { document: testDocument } });
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await app.close();
  });

  it('POST /auth/login retorna accessToken e status da empresa PENDING_APPROVAL', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(200);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.user).toMatchObject({ email: testEmail, type: 'COMPANY_MEMBER' });
    expect(response.body.company).toMatchObject({ status: 'PENDING_APPROVAL' });
  });

  it('POST /auth/login rejeita senha incorreta com 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: 'senhaErrada' })
      .expect(401);
  });

  it('POST /auth/login rejeita e-mail inexistente com 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'ninguem@example.com', password: testPassword })
      .expect(401);
  });

  it('GET /auth/me retorna o usuário autenticado quando o token é válido', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(200);

    const meResponse = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .expect(200);

    expect(meResponse.body).toMatchObject({ email: testEmail, type: 'COMPANY_MEMBER' });
  });

  it('GET /auth/me rejeita requisição sem token com 401', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });
});
