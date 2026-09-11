import { PickupArrivalService, type ArrivalDelivery } from './pickup-arrival.service';
import { reportDeliveryLocationSchema } from '@motoboycity/validation';

describe('PickupArrivalService', () => {
  const start = Date.parse('2026-09-11T12:00:00Z');
  const delivery: ArrivalDelivery = {
    id: 'delivery',
    displayNumber: 777,
    companyId: 'company',
    driverId: 'driver',
    status: 'ACCEPTED',
    statusChangedAt: new Date(start - 60_000),
    pickupArrivalNotifiedAt: null,
    addresses: [{ lat: -20.15, lng: -41.62 }],
  };
  const prisma = { delivery: { updateMany: jest.fn() } };
  const realtime = { emitPickupArrival: jest.fn() };
  let service: PickupArrivalService;
  const point = (offset: number) => ({
    lat: -20.15,
    lng: -41.62,
    accuracy: 10,
    speedMps: 0,
    sampledAt: start + offset,
  });
  const send = (offset: number, change = {}, order = delivery) =>
    service.observe(order, { ...point(offset), ...change }, start + offset);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.delivery.updateMany.mockResolvedValue({ count: 1 });
    service = new PickupArrivalService(prisma as never, realtime as never);
  });

  it('somente confirma apos 3 fixes novos e 20 segundos de observacao', async () => {
    await send(0);
    await send(10_000);
    expect(prisma.delivery.updateMany).not.toHaveBeenCalled();
    expect(await send(20_000)).toBeUndefined();
    expect(prisma.delivery.updateMany).toHaveBeenCalledWith({
      where: {
        id: delivery.id,
        driverId: delivery.driverId,
        status: 'ACCEPTED',
        statusChangedAt: delivery.statusChangedAt,
        pickupArrivalNotifiedAt: null,
      },
      data: { pickupArrivalNotifiedAt: new Date(start + 20_000) },
    });
    expect(realtime.emitPickupArrival).toHaveBeenCalledTimes(1);
    expect(realtime.emitPickupArrival).toHaveBeenCalledWith(
      'company',
      expect.objectContaining({ displayNumber: 777 }),
    );
  });

  it.each([
    ['fora do raio', { lat: -20.151 }],
    ['GPS ruim', { accuracy: 21 }],
    ['precisao ausente', { accuracy: undefined }],
    ['precisao zero', { accuracy: 0 }],
    ['rapido', { speedMps: 1.4 }],
    ['velocidade ausente', { speedMps: undefined }],
    ['APK antigo', { sampledAt: undefined }],
    ['fix antigo', { sampledAt: start - 60_000 }],
    ['relogio no futuro', { sampledAt: start + 100_000 }],
  ])('reinicia a permanencia quando %s', async (_name, change) => {
    await send(0);
    await send(10_000, change);
    await send(20_000);
    await send(30_000);
    expect(prisma.delivery.updateMany).not.toHaveBeenCalled();
    await send(40_000);
    expect(realtime.emitPickupArrival).toHaveBeenCalledTimes(1);
  });

  it.each(['COLLECTED', 'DELIVERED', 'CANCELED', 'AWAITING_DRIVER', 'FAILED'])(
    'nao avisa em %s',
    async (status) => {
      for (const offset of [0, 10_000, 20_000]) await send(offset, {}, { ...delivery, status });
      expect(prisma.delivery.updateMany).not.toHaveBeenCalled();
    },
  );

  it('aceita os limites aprovados de precisao e velocidade', async () => {
    for (const offset of [0, 10_000, 20_000])
      await send(offset, { accuracy: 20, speedMps: 5 / 3.6 });
    expect(realtime.emitPickupArrival).toHaveBeenCalledTimes(1);
  });

  it('nao completa com fix repetido, fora de ordem ou com lacuna de GPS', async () => {
    await send(0);
    await send(10_000, { sampledAt: start });
    await send(12_000, { sampledAt: start - 1 });
    await send(30_000);
    await send(40_000);
    expect(prisma.delivery.updateMany).not.toHaveBeenCalled();
    await send(50_000);
    expect(realtime.emitPickupArrival).toHaveBeenCalledTimes(1);
  });

  it('nao usa fixes anteriores ao aceite nem os do entregador anterior', async () => {
    await send(0);
    await send(10_000);
    const reassigned = {
      ...delivery,
      driverId: 'outro',
      statusChangedAt: new Date(start + 15_000),
    };
    await send(20_000, { sampledAt: start + 14_000 }, reassigned);
    await send(30_000, {}, reassigned);
    await send(40_000, {}, reassigned);
    expect(prisma.delivery.updateMany).not.toHaveBeenCalled();
  });

  it('nao repete apos reinicio quando o carimbo duravel existe', async () => {
    const notified = { ...delivery, pickupArrivalNotifiedAt: new Date(start) };
    for (const offset of [0, 10_000, 20_000])
      expect(await send(offset, {}, notified)).toBeUndefined();
    expect(prisma.delivery.updateMany).not.toHaveBeenCalled();
  });

  it('nao avisa se a atribuicao/status mudou durante a disputa atomica', async () => {
    prisma.delivery.updateMany.mockResolvedValue({ count: 0 });
    await send(0);
    await send(10_000);
    await send(20_000);
    expect(realtime.emitPickupArrival).not.toHaveBeenCalled();
  });

  it('falha do aviso nao rejeita rastreamento e permite tentar novamente', async () => {
    prisma.delivery.updateMany.mockRejectedValueOnce(new Error('offline'));
    await send(0);
    await send(10_000);
    await expect(send(20_000)).resolves.toEqual({ lat: -20.15, lng: -41.62 });
    await send(30_000);
    expect(realtime.emitPickupArrival).toHaveBeenCalledTimes(1);
  });

  it('nao detecta sem coordenadas da coleta', async () => {
    for (const offset of [0, 10_000, 20_000])
      await send(offset, {}, { ...delivery, addresses: [{ lat: null, lng: null }] });
    expect(prisma.delivery.updateMany).not.toHaveBeenCalled();
  });

  it('mantem contrato legado e rejeita novos campos invalidos', () => {
    expect(reportDeliveryLocationSchema.safeParse({ lat: 0, lng: 0 }).success).toBe(true);
    expect(reportDeliveryLocationSchema.safeParse(point(0)).success).toBe(true);
    for (const invalid of [
      { speedMps: -1 },
      { speedMps: Infinity },
      { sampledAt: 'ontem' },
      { sampledAt: -1 },
    ]) {
      expect(reportDeliveryLocationSchema.safeParse({ ...point(0), ...invalid }).success).toBe(
        false,
      );
    }
  });
});
