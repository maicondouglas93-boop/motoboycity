import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const suffix = String(Date.now()).slice(-8);
const password = 'senhaSegura123';
const companies = [
  {
    email: `tracking.a.${suffix}@example.com`,
    document: `301${suffix}`.slice(0, 11),
    tradeName: 'Empresa Tracking A',
  },
  {
    email: `tracking.b.${suffix}@example.com`,
    document: `302${suffix}`.slice(0, 11),
    tradeName: 'Empresa Tracking B',
  },
];

describe('PublicDeliveryTrackingController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens: string[] = [];
  let deliveryId: string;
  let publicToken: string;
  let driverUserId: string;
  let driverId: string;
  let serviceTypeId: string;
  let regionId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    prisma = module.get(PrismaService);
    await app.init();

    const region = await prisma.region.create({
      data: { name: `Tracking E2E ${suffix}` },
    });
    regionId = region.id;

    for (const company of companies) {
      await request(app.getHttpServer())
        .post('/auth/register/company')
        .send({
          name: company.tradeName,
          email: company.email,
          phone: '33999887766',
          document: company.document,
          legalName: `${company.tradeName} LTDA`,
          tradeName: company.tradeName,
          password,
        })
        .expect(201);
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: company.email, password })
        .expect(200);
      tokens.push(login.body.accessToken as string);
    }

    const company = await prisma.company.findUniqueOrThrow({
      where: { document: companies[0]!.document },
    });
    const serviceType = await prisma.serviceType.create({
      data: { code: `tracking-${suffix}`, name: 'Tracking E2E' },
    });
    serviceTypeId = serviceType.id;
    const driverUser = await prisma.user.create({
      data: {
        type: 'DRIVER',
        name: 'Motoboy Tracking E2E',
        email: `tracking.driver.${suffix}@example.com`,
        phone: '33999776655',
        passwordHash: 'nao-usado-no-teste',
      },
    });
    driverUserId = driverUser.id;
    const driver = await prisma.driver.create({
      data: {
        userId: driverUser.id,
        cpf: `401${suffix}`.slice(0, 11),
        birthDate: new Date('1990-01-01T00:00:00.000Z'),
        pixKey: `tracking-${suffix}`,
        pixKeyType: 'EVP',
        regionId: company.regionId,
      },
    });
    driverId = driver.id;
    const delivery = await prisma.delivery.create({
      data: {
        companyId: company.id,
        driverId: driver.id,
        serviceTypeId: serviceType.id,
        status: 'COLLECTED',
        paymentMethod: 'BILLED',
        recipientName: 'Dado privado',
        recipientPhone: '33999998888',
      },
    });
    deliveryId = delivery.id;
    await prisma.deliveryLocationPoint.create({
      data: {
        deliveryId: delivery.id,
        driverId: driver.id,
        lat: -20.151,
        lng: -41.622,
        accuracy: 8,
        capturedAt: new Date('2026-08-27T12:00:00.000Z'),
      },
    });
  });

  afterAll(async () => {
    if (deliveryId) {
      await prisma.deliveryLocationPoint.deleteMany({ where: { deliveryId } });
      await prisma.delivery.deleteMany({ where: { id: deliveryId } });
    }
    if (driverId) await prisma.driver.deleteMany({ where: { id: driverId } });
    if (driverUserId) await prisma.user.deleteMany({ where: { id: driverUserId } });
    if (serviceTypeId) await prisma.serviceType.deleteMany({ where: { id: serviceTypeId } });
    await prisma.companyTeamMember.deleteMany({
      where: { user: { email: { in: companies.map((company) => company.email) } } },
    });
    await prisma.company.deleteMany({
      where: { document: { in: companies.map((company) => company.document) } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: companies.map((company) => company.email) } },
    });
    if (regionId) await prisma.region.deleteMany({ where: { id: regionId } });
    await app.close();
  });

  it('gera um token estavel somente para a empresa dona', async () => {
    const first = await request(app.getHttpServer())
      .post(`/tracking/deliveries/${deliveryId}/public-link`)
      .set('Authorization', `Bearer ${tokens[0]}`)
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/tracking/deliveries/${deliveryId}/public-link`)
      .set('Authorization', `Bearer ${tokens[0]}`)
      .expect(201);

    publicToken = first.body.token as string;
    expect(publicToken).toMatch(/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/);
    expect(second.body.token).toBe(publicToken);

    await request(app.getHttpServer())
      .post(`/tracking/deliveries/${deliveryId}/public-link`)
      .set('Authorization', `Bearer ${tokens[1]}`)
      .expect(404);
  });

  it('retorna somente o contrato publico minimo', async () => {
    const response = await request(app.getHttpServer())
      .get(`/public/tracking/${publicToken}`)
      .expect(200);

    expect(response.body).toEqual({
      status: 'IN_TRANSIT',
      updatedAt: expect.any(String),
      location: {
        lat: -20.151,
        lng: -41.622,
        capturedAt: '2026-08-27T12:00:00.000Z',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('Dado privado');
    expect(JSON.stringify(response.body)).not.toContain('33999998888');
    expect(JSON.stringify(response.body)).not.toContain(deliveryId);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('rejeita token malformado ou com assinatura adulterada', async () => {
    await request(app.getHttpServer()).get('/public/tracking/token-curto').expect(400);

    const last = publicToken.at(-1);
    const tampered = `${publicToken.slice(0, -1)}${last === 'a' ? 'b' : 'a'}`;
    await request(app.getHttpServer()).get(`/public/tracking/${tampered}`).expect(404);
  });

  it('expira imediatamente quando a entrega termina', async () => {
    await prisma.delivery.update({
      where: { id: deliveryId },
      data: { status: 'COMPLETED', statusChangedAt: new Date() },
    });

    await request(app.getHttpServer()).get(`/public/tracking/${publicToken}`).expect(410);
  });
});
