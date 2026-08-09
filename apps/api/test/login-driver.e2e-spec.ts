import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

const uniqueSuffix = Date.now();
const testEmail = `teste.login.driver.${uniqueSuffix}@example.com`;
const testCpf = `222${String(uniqueSuffix).slice(-8)}`;
const testPassword = 'senhaSegura123';

const registerPayload = {
  name: 'Login Driver Teste E2E',
  email: testEmail,
  phone: '33999887766',
  cpf: testCpf,
  birthDate: '1990-05-20',
  pixKey: testEmail,
  pixKeyType: 'EMAIL',
  hasCnpj: false,
  password: testPassword,
};

describe('Login de motoboy — gate de aprovação (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let driverId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    await app.init();

    const response = await request(app.getHttpServer())
      .post('/auth/register/driver')
      .send(registerPayload);
    driverId = response.body.driverId;
  });

  afterAll(async () => {
    await prisma.driver.deleteMany({ where: { user: { email: testEmail } } });
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await app.close();
  });

  it('permite login com approvalStatus PENDING (padrão pós-cadastro) e devolve driver no corpo', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(200);

    expect(response.body.driver).toEqual({ id: driverId, approvalStatus: 'PENDING' });
  });

  it('permite login normalmente após aprovado', async () => {
    await prisma.driver.update({ where: { id: driverId }, data: { approvalStatus: 'APPROVED' } });

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(200);

    expect(response.body.driver).toEqual({ id: driverId, approvalStatus: 'APPROVED' });
  });

  it('rejeita login com approvalStatus REJECTED com 403', async () => {
    await prisma.driver.update({ where: { id: driverId }, data: { approvalStatus: 'REJECTED' } });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(403);
  });

  it('rejeita login com accountStatus SUSPENDED com 403', async () => {
    await prisma.driver.update({
      where: { id: driverId },
      data: { approvalStatus: 'APPROVED', accountStatus: 'SUSPENDED' },
    });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(403);
  });

  it('rejeita login com accountStatus BLOCKED com 403', async () => {
    await prisma.driver.update({
      where: { id: driverId },
      data: { accountStatus: 'BLOCKED' },
    });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(403);
  });
});
