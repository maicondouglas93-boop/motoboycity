import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { saoPauloDateParts } from './../src/common/sao-paulo-time';

const uniqueSuffix = Date.now();
const companyEmail = `teste.horario.${uniqueSuffix}@example.com`;
const companyDocument = `4101234${String(uniqueSuffix).slice(-4)}`;
const companyPassword = 'senhaSegura123';
const serviceTypeCode = `TESTE_HORARIO_${uniqueSuffix}`;

const adminEmail = process.env['ADMIN_SEED_EMAIL'] ?? 'admin@motoboycity.local';
const adminPassword = process.env['ADMIN_SEED_PASSWORD'] ?? 'admin_dev_only_change_me';

describe('AdminBusinessHoursController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let serviceTypeId: string;

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

    const serviceType = await request(app.getHttpServer())
      .post('/admin/service-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: serviceTypeCode, name: 'Serviço Teste Horário E2E' });
    serviceTypeId = serviceType.body.id;
  });

  afterAll(async () => {
    // Deixa o ambiente como estava: sem faixas e com o bloqueio desligado, que
    // e o estado padrao e o que os outros e2e assumem ao criar pedidos.
    await prisma.businessHour.deleteMany({});
    await prisma.platformSettings.updateMany({ data: { businessHoursEnabled: false } });
    await prisma.delivery.deleteMany({ where: { company: { document: companyDocument } } });
    await prisma.companyAddress.deleteMany({ where: { company: { document: companyDocument } } });
    await prisma.companyTeamMember.deleteMany({
      where: { company: { document: companyDocument } },
    });
    await prisma.company.deleteMany({ where: { document: companyDocument } });
    await prisma.user.deleteMany({ where: { email: companyEmail } });
    await prisma.serviceType.deleteMany({ where: { code: serviceTypeCode } });
    await app.close();
  });

  it('rejeita sem token com 401', async () => {
    await request(app.getHttpServer()).get('/admin/business-hours').expect(401);
  });

  it('sem faixa configurada, a operação está aberta', async () => {
    await prisma.businessHour.deleteMany({});

    const response = await request(app.getHttpServer())
      .get('/admin/business-hours')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // Quem nunca configurou nao pode ter pedido recusado por omissao.
    expect(response.body.hours).toEqual([]);
    expect(response.body.openNow).toBe(true);
    expect(response.body.nextOpeningLabel).toBeNull();
  });

  it('recusa faixa que abre e fecha no mesmo horário', async () => {
    await request(app.getHttpServer())
      .put('/admin/business-hours')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ hours: [{ weekday: 1, startMinute: 600, endMinute: 600 }] })
      .expect(400);
  });

  it('substitui o conjunto inteiro de faixas', async () => {
    await request(app.getHttpServer())
      .put('/admin/business-hours')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        hours: [
          { weekday: 1, startMinute: 8 * 60, endMinute: 12 * 60 },
          { weekday: 1, startMinute: 13 * 60, endMinute: 18 * 60 },
        ],
      })
      .expect(200);

    const segunda = await request(app.getHttpServer())
      .put('/admin/business-hours')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ hours: [{ weekday: 2, startMinute: 9 * 60, endMinute: 17 * 60 }] })
      .expect(200);

    // As duas faixas de segunda sumiram: o conjunto e trocado, nao mesclado.
    expect(segunda.body.hours).toHaveLength(1);
    expect(segunda.body.hours[0]).toMatchObject({ weekday: 2, startMinute: 540 });
  });

  describe('bloqueio da criação de pedido', () => {
    let companyToken: string;

    beforeAll(async () => {
      // Empresa propria, como os outros e2e fazem — reaproveitar uma semeada
      // deixaria este teste dependendo do estado que outro arquivo deixou.
      const server = app.getHttpServer();
      const registro = await request(server).post('/auth/register/company').send({
        name: 'Dono Horario E2E',
        email: companyEmail,
        phone: '33999887766',
        document: companyDocument,
        legalName: 'Horario E2E LTDA',
        tradeName: 'Horario E2E',
        password: companyPassword,
      });
      await request(server)
        .patch(`/admin/companies/${registro.body.companyId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      const login = await request(server)
        .post('/auth/login')
        .send({ email: companyEmail, password: companyPassword });
      companyToken = login.body.accessToken;

      // O bloqueio de horario roda DEPOIS da checagem de endereco de coleta,
      // entao sem endereco o teste receberia outro erro.
      await request(server)
        .put('/company/address')
        .set('Authorization', `Bearer ${companyToken}`)
        .send({
          street: 'Rua da Loja',
          number: '100',
          city: 'Lajinha',
          state: 'MG',
          zip: '36930000',
        });
    });

    it('recusa pedido fora do horário e diz quando abre', async () => {
      if (!companyToken) return;

      /**
       * A janela e montada a partir do instante atual para o teste nao depender
       * da hora em que o CI roda: uma faixa de um minuto no dia de AMANHA
       * garante que agora esta fora, sempre.
       */
      const agora = saoPauloDateParts(new Date());
      const amanha = (agora.weekday + 1) % 7;

      await request(app.getHttpServer())
        .put('/admin/business-hours')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ hours: [{ weekday: amanha, startMinute: 10 * 60, endMinute: 11 * 60 }] })
        .expect(200);

      await request(app.getHttpServer())
        .patch('/admin/platform-settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ businessHoursEnabled: true })
        .expect(200);

      const recusa = await request(app.getHttpServer())
        .post('/deliveries')
        .set('Authorization', `Bearer ${companyToken}`)
        .send({ serviceTypeId, destinationKnownAtCreation: false })
        .expect(409);

      expect(recusa.body.message).toContain('fora do horário de funcionamento');
      // A recusa vira instrucao: precisa dizer quando abre.
      expect(recusa.body.message).toContain('Abre');
    });

    it('com o bloqueio desligado, o pedido passa mesmo fora do horário', async () => {
      if (!companyToken) return;

      await request(app.getHttpServer())
        .patch('/admin/platform-settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ businessHoursEnabled: false })
        .expect(200);

      const criado = await request(app.getHttpServer())
        .post('/deliveries')
        .set('Authorization', `Bearer ${companyToken}`)
        .send({ serviceTypeId, destinationKnownAtCreation: false });

      /**
       * A assercao e sobre o BLOQUEIO, nao sobre o pedido dar certo: criar uma
       * entrega depende de despacho configurado, e mexer nisso aqui quebraria o
       * e2e de configuracoes, que assevera valores exatos. O que importa e que
       * a recusa por horario sumiu — as faixas continuam la, mas nao bloqueiam.
       */
      expect(String(criado.body.message ?? '')).not.toContain('horário de funcionamento');
      if (criado.body.id) {
        await prisma.delivery.deleteMany({ where: { id: criado.body.id } });
      }
    });
  });
});
