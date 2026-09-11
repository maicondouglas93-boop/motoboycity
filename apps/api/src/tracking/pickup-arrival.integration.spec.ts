import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PickupArrivalService, type ArrivalDelivery } from './pickup-arrival.service';

// Nao importa AppModule/.env nem filas. Exclusivamente o banco descartavel autorizado.
const enabled = process.env['PICKUP_ARRIVAL_DB_TEST'] === '1';
(enabled ? describe : describe.skip)('Pickup arrival — PostgreSQL isolado', () => {
  let prisma: PrismaService;
  let order: ArrivalDelivery;
  let regionId: string;
  let userId: string;
  let serviceTypeId: string;
  const realtime = { emitPickupArrival: jest.fn() };
  const start = Date.now();

  beforeAll(async () => {
    const url = new URL(process.env['DATABASE_URL'] ?? 'http://invalid');
    if (
      url.hostname !== '127.0.0.1' ||
      url.port !== '55439' ||
      url.pathname !== '/arrival_check' ||
      process.env['DIRECT_URL'] !== process.env['DATABASE_URL']
    )
      throw new Error('Banco isolado nao confirmado');
    prisma = new PrismaService({ datasources: { db: { url: url.toString() } } });
    const suffix = randomUUID();
    const region = await prisma.region.create({ data: { name: `arrival-test-${suffix}` } });
    regionId = region.id;
    const company = await prisma.company.create({
      data: { regionId, legalName: 'Arrival test', tradeName: 'Arrival test', document: suffix },
    });
    const user = await prisma.user.create({
      data: {
        type: 'DRIVER',
        name: 'Arrival test',
        email: `${suffix}@example.invalid`,
        phone: '00000000000',
        passwordHash: 'not-a-login',
      },
    });
    userId = user.id;
    const driver = await prisma.driver.create({
      data: {
        userId,
        cpf: suffix,
        birthDate: new Date('1990-01-01'),
        pixKey: suffix,
        pixKeyType: 'EVP',
        regionId,
      },
    });
    const serviceType = await prisma.serviceType.create({
      data: { code: suffix, name: 'Arrival test' },
    });
    serviceTypeId = serviceType.id;
    const delivery = await prisma.delivery.create({
      data: {
        companyId: company.id,
        driverId: driver.id,
        serviceTypeId,
        status: 'ACCEPTED',
        statusChangedAt: new Date(start - 60_000),
        paymentMethod: 'BILLED',
        totalValue: 10,
      },
    });
    order = { ...delivery, addresses: [{ lat: -20.15, lng: -41.62 }] };
  });

  afterAll(async () => {
    if (order) {
      await prisma.delivery.delete({ where: { id: order.id } });
      await prisma.driver.delete({ where: { id: order.driverId! } });
      await prisma.company.delete({ where: { id: order.companyId } });
    }
    if (userId) await prisma.user.delete({ where: { id: userId } });
    if (serviceTypeId) await prisma.serviceType.delete({ where: { id: serviceTypeId } });
    if (regionId) await prisma.region.delete({ where: { id: regionId } });
    await prisma?.$disconnect();
  });

  it('duas instancias concorrentes gravam e emitem apenas uma vez, sem mudar valor/status', async () => {
    const instances = [
      new PickupArrivalService(prisma, realtime as never),
      new PickupArrivalService(prisma, realtime as never),
    ];
    for (const offset of [0, 10_000, 20_000]) {
      await Promise.all(
        instances.map((instance) =>
          instance.observe(
            order,
            {
              lat: -20.15,
              lng: -41.62,
              accuracy: 10,
              speedMps: 0,
              sampledAt: start + offset,
            },
            start + offset,
          ),
        ),
      );
    }
    expect(realtime.emitPickupArrival).toHaveBeenCalledTimes(1);
    const saved = await prisma.delivery.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved.pickupArrivalNotifiedAt).toEqual(new Date(start + 20_000));
    expect(saved.status).toBe('ACCEPTED');
    expect(Number(saved.totalValue)).toBe(10);
    const restarted = new PickupArrivalService(prisma, realtime as never);
    await restarted.observe(
      { ...saved, addresses: order.addresses },
      { lat: -20.15, lng: -41.62, accuracy: 10, speedMps: 0, sampledAt: start + 30_000 },
      start + 30_000,
    );
    expect(realtime.emitPickupArrival).toHaveBeenCalledTimes(1);
  });
});
