import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

const uniqueSuffix = Date.now();
const surchargeName = `Taxa Teste E2E ${uniqueSuffix}`;

const adminEmail = process.env['ADMIN_SEED_EMAIL'] ?? 'admin@motoboycity.local';
const adminPassword = process.env['ADMIN_SEED_PASSWORD'] ?? 'admin_dev_only_change_me';

describe('AdminSurchargesController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let surchargeId: string;

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
  });

  afterAll(async () => {
    await prisma.surcharge.deleteMany({ where: { name: { startsWith: 'Taxa Teste E2E' } } });
    await app.close();
  });

  it('rejeita listagem sem token com 401', async () => {
    await request(app.getHttpServer()).get('/admin/surcharges').expect(401);
  });

  it('recusa taxa sem nome', async () => {
    await request(app.getHttpServer())
      .post('/admin/surcharges')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '', type: 'PERCENTAGE', value: 20 })
      .expect(400);
  });

  it('recusa valor zero ou negativo', async () => {
    await request(app.getHttpServer())
      .post('/admin/surcharges')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: surchargeName, type: 'PERCENTAGE', value: 0 })
      .expect(400);
  });

  it('recusa janela de duração zero', async () => {
    // Uma janela que comeca e termina no mesmo minuto nao valeria nunca — seria
    // configuracao morta na tela, entao o schema barra na entrada.
    await request(app.getHttpServer())
      .post('/admin/surcharges')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: surchargeName,
        type: 'PERCENTAGE',
        value: 20,
        schedules: [{ startMinute: 600, endMinute: 600 }],
      })
      .expect(400);
  });

  it('cria taxa com janela e devolve o estado resolvido', async () => {
    const response = await request(app.getHttpServer())
      .post('/admin/surcharges')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: surchargeName,
        type: 'PERCENTAGE',
        value: 20,
        driverSharePercentage: 100,
        schedules: [{ weekday: 5, startMinute: 18 * 60, endMinute: 23 * 60 }],
      })
      .expect(201);

    surchargeId = response.body.id;
    expect(response.body).toMatchObject({
      name: surchargeName,
      type: 'PERCENTAGE',
      value: 20,
      driverSharePercentage: 100,
      active: true,
      manuallyActive: false,
    });
    expect(response.body.schedules).toHaveLength(1);
    expect(response.body.schedules[0]).toMatchObject({ weekday: 5, startMinute: 1080 });
    // `activeNow` vem resolvido do servidor: o painel nao reavalia janela.
    expect(typeof response.body.activeNow).toBe('boolean');
  });

  it('o interruptor manual faz a taxa valer na hora', async () => {
    const ligada = await request(app.getHttpServer())
      .patch(`/admin/surcharges/${surchargeId}/turn-on`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(ligada.body.manuallyActive).toBe(true);
    // Manual ligado vale a qualquer hora, independente da janela de sexta.
    expect(ligada.body.activeNow).toBe(true);

    const desligada = await request(app.getHttpServer())
      .patch(`/admin/surcharges/${surchargeId}/turn-off`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(desligada.body.manuallyActive).toBe(false);
  });

  it('desativar também desliga o interruptor manual', async () => {
    await request(app.getHttpServer())
      .patch(`/admin/surcharges/${surchargeId}/turn-on`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const desativada = await request(app.getHttpServer())
      .patch(`/admin/surcharges/${surchargeId}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // Sem isto, reativar a taxa depois a faria voltar cobrando sozinha.
    expect(desativada.body.active).toBe(false);
    expect(desativada.body.manuallyActive).toBe(false);
    expect(desativada.body.activeNow).toBe(false);
  });

  it('recusa ligar o interruptor de uma taxa desativada', async () => {
    await request(app.getHttpServer())
      .patch(`/admin/surcharges/${surchargeId}/turn-on`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);
  });

  it('editar substitui as janelas por inteiro', async () => {
    await request(app.getHttpServer())
      .patch(`/admin/surcharges/${surchargeId}/activate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const response = await request(app.getHttpServer())
      .patch(`/admin/surcharges/${surchargeId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `${surchargeName} editada`,
        type: 'FIXED',
        value: 3,
        driverSharePercentage: 50,
        schedules: [
          { startDate: '2026-12-24', endDate: '2026-12-26', startMinute: 0, endMinute: 1440 },
        ],
      })
      .expect(200);

    expect(response.body.name).toBe(`${surchargeName} editada`);
    expect(response.body.type).toBe('FIXED');
    // A janela de sexta sumiu: o conjunto e trocado, nao mesclado.
    expect(response.body.schedules).toHaveLength(1);
    expect(response.body.schedules[0]).toMatchObject({ startDate: '2026-12-24', weekday: null });
  });

  it('excluir remove a taxa e as janelas junto', async () => {
    await request(app.getHttpServer())
      .delete(`/admin/surcharges/${surchargeId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    const restantes = await prisma.surchargeSchedule.findMany({ where: { surchargeId } });
    expect(restantes).toHaveLength(0);
  });

  it('retorna 404 ao mexer numa taxa inexistente', async () => {
    await request(app.getHttpServer())
      .patch('/admin/surcharges/00000000-0000-0000-0000-000000000000/turn-on')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
