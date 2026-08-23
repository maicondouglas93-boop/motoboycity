import { Test, TestingModule } from '@nestjs/testing';
import { AdminPlatformSettingsService } from '../admin/platform-settings/admin-platform-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { LocationSilenceService } from './location-silence.service';

const agora = new Date('2026-08-23T15:00:00.000Z');

function minutosAtras(minutos: number): Date {
  return new Date(agora.getTime() - minutos * 60_000);
}

describe('LocationSilenceService', () => {
  let service: LocationSilenceService;
  let prisma: {
    delivery: { findMany: jest.Mock };
    deliveryLocationPoint: { groupBy: jest.Mock };
    driver: { update: jest.Mock };
  };
  let settings: { get: jest.Mock };
  let realtime: { emitToDriver: jest.Mock; emitAdminActivity: jest.Mock };
  let push: { sendToDriver: jest.Mock };

  /** Um pedido em andamento, com o motoboy e o carimbo do estado. */
  function pedido(overrides: Record<string, unknown> = {}) {
    return {
      id: 'delivery-1',
      displayNumber: 1001,
      driverId: 'driver-1',
      statusChangedAt: minutosAtras(60),
      driver: {
        locationSilenceAlertedAt: null,
        user: { name: 'Fulano' },
      },
      ...overrides,
    };
  }

  beforeEach(async () => {
    prisma = {
      delivery: { findMany: jest.fn().mockResolvedValue([]) },
      deliveryLocationPoint: { groupBy: jest.fn().mockResolvedValue([]) },
      driver: { update: jest.fn() },
    };
    settings = { get: jest.fn().mockResolvedValue({ locationSilenceAlertMinutes: 10 }) };
    realtime = { emitToDriver: jest.fn(), emitAdminActivity: jest.fn() };
    push = { sendToDriver: jest.fn().mockResolvedValue(1) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationSilenceService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdminPlatformSettingsService, useValue: settings },
        { provide: RealtimeGateway, useValue: realtime },
        { provide: PushService, useValue: push },
      ],
    }).compile();

    service = module.get(LocationSilenceService);
  });

  describe('detector desligado', () => {
    it('não consulta nada quando o limite não está configurado', async () => {
      // Convencao do resto de PlatformSettings: nulo e "o admin nao
      // configurou", e uma operacao que nunca configurou nao pode acordar um
      // dia mandando aviso sozinha.
      settings.get.mockResolvedValue({ locationSilenceAlertMinutes: null });

      await expect(service.alertSilentDrivers(agora)).resolves.toBe(0);
      expect(prisma.delivery.findMany).not.toHaveBeenCalled();
    });
  });

  describe('quem entra na varredura', () => {
    it('olha os quatro status em que o motoboy está na rua', async () => {
      await service.alertSilentDrivers(agora);

      const where = prisma.delivery.findMany.mock.calls[0]?.[0]?.where;
      // DELIVERED so fica parado quando exige retorno, e FAILED e a mercadoria
      // voltando: nos dois o motoboy esta na rua e a loja ainda espera.
      expect(where.status.in).toEqual(['ACCEPTED', 'COLLECTED', 'DELIVERED', 'FAILED']);
      expect(where.driverId).toEqual({ not: null });
    });

    it('motoboy sem pedido em andamento não gera aviso', async () => {
      // Entre corridas ele pode legitimamente estar com o app fechado.
      prisma.delivery.findMany.mockResolvedValue([]);

      await expect(service.alertSilentDrivers(agora)).resolves.toBe(0);
      expect(realtime.emitToDriver).not.toHaveBeenCalled();
    });
  });

  describe('avisos', () => {
    it('avisa o motoboy e o admin, e carimba para não repetir', async () => {
      prisma.delivery.findMany.mockResolvedValue([pedido()]);
      prisma.deliveryLocationPoint.groupBy.mockResolvedValue([
        { driverId: 'driver-1', _max: { capturedAt: minutosAtras(14) } },
      ]);

      await expect(service.alertSilentDrivers(agora)).resolves.toBe(1);

      expect(realtime.emitToDriver).toHaveBeenCalledWith('driver-1', 'driver:location-lost', {
        activeDeliveryCount: 1,
        silentMinutes: 14,
      });
      const aviso = realtime.emitAdminActivity.mock.calls[0]?.[0];
      expect(aviso.type).toBe('DRIVER_LOCATION_LOST');
      // O admin precisa do nome, de quantos pedidos e de ha quanto tempo: e o
      // que responde a ligacao da loja.
      expect(aviso.message).toContain('Fulano');
      expect(aviso.message).toContain('#1001');
      expect(aviso.message).toContain('14 min');
      expect(prisma.driver.update).toHaveBeenCalledWith({
        where: { id: 'driver-1' },
        data: { locationSilenceAlertedAt: agora },
      });
    });

    it('avisa tambem por push, que e o que alcanca o app fechado', async () => {
      // O socket so chega com o app vivo — e app encerrado e justamente a causa
      // mais provavel de a posicao ter sumido.
      prisma.delivery.findMany.mockResolvedValue([pedido()]);
      prisma.deliveryLocationPoint.groupBy.mockResolvedValue([
        { driverId: 'driver-1', _max: { capturedAt: minutosAtras(14) } },
      ]);

      await service.alertSilentDrivers(agora);

      expect(push.sendToDriver).toHaveBeenCalledWith(
        'driver-1',
        expect.objectContaining({ data: { type: 'location-lost' } }),
      );
    });

    it('não repete o aviso dentro do mesmo episódio', async () => {
      prisma.delivery.findMany.mockResolvedValue([
        pedido({
          driver: { locationSilenceAlertedAt: minutosAtras(6), user: { name: 'Fulano' } },
        }),
      ]);
      prisma.deliveryLocationPoint.groupBy.mockResolvedValue([
        { driverId: 'driver-1', _max: { capturedAt: minutosAtras(30) } },
      ]);

      await expect(service.alertSilentDrivers(agora)).resolves.toBe(0);
      expect(realtime.emitToDriver).not.toHaveBeenCalled();
    });

    it('avisa de novo depois que a posição volta e some outra vez', async () => {
      prisma.delivery.findMany.mockResolvedValue([
        pedido({
          driver: { locationSilenceAlertedAt: minutosAtras(40), user: { name: 'Fulano' } },
        }),
      ]);
      prisma.deliveryLocationPoint.groupBy.mockResolvedValue([
        // Chegou posicao DEPOIS do aviso anterior: episodio novo.
        { driverId: 'driver-1', _max: { capturedAt: minutosAtras(12) } },
      ]);

      await expect(service.alertSilentDrivers(agora)).resolves.toBe(1);
    });

    it('quem nunca mandou posição conta desde que assumiu o pedido', async () => {
      // O caso mais grave: aceitou, o rastreamento nunca subiu, e sem este
      // fallback ele nao apareceria em varredura nenhuma.
      prisma.delivery.findMany.mockResolvedValue([pedido({ statusChangedAt: minutosAtras(25) })]);
      prisma.deliveryLocationPoint.groupBy.mockResolvedValue([]);

      await expect(service.alertSilentDrivers(agora)).resolves.toBe(1);
      expect(realtime.emitToDriver).toHaveBeenCalledWith(
        'driver-1',
        'driver:location-lost',
        expect.objectContaining({ silentMinutes: 25 }),
      );
    });

    it('agrupa os pedidos do mesmo motoboy num aviso só', async () => {
      prisma.delivery.findMany.mockResolvedValue([
        pedido(),
        pedido({ id: 'delivery-2', displayNumber: 1002 }),
      ]);
      prisma.deliveryLocationPoint.groupBy.mockResolvedValue([
        { driverId: 'driver-1', _max: { capturedAt: minutosAtras(14) } },
      ]);

      await expect(service.alertSilentDrivers(agora)).resolves.toBe(1);
      expect(realtime.emitToDriver).toHaveBeenCalledWith(
        'driver-1',
        'driver:location-lost',
        expect.objectContaining({ activeDeliveryCount: 2 }),
      );
      expect(realtime.emitAdminActivity.mock.calls[0]?.[0]?.message).toContain('#1001, #1002');
    });
  });

  describe('listSilentDrivers', () => {
    it('mostra o estado atual mesmo de quem já foi avisado', async () => {
      // O painel quer o ESTADO, nao o log de avisos: esconder quem ja foi
      // avisado deixaria o admin sem o numero justamente durante o problema.
      prisma.delivery.findMany.mockResolvedValue([
        pedido({
          driver: { locationSilenceAlertedAt: minutosAtras(5), user: { name: 'Fulano' } },
        }),
      ]);
      prisma.deliveryLocationPoint.groupBy.mockResolvedValue([
        { driverId: 'driver-1', _max: { capturedAt: minutosAtras(30) } },
      ]);

      const lista = await service.listSilentDrivers(agora);

      expect(lista).toEqual([
        {
          driverId: 'driver-1',
          driverName: 'Fulano',
          activeDeliveryCount: 1,
          deliveryNumbers: [1001],
          silentMinutes: 30,
          lastContactAt: minutosAtras(30).toISOString(),
        },
      ]);
    });

    it('não lista quem está abaixo do limite', async () => {
      prisma.delivery.findMany.mockResolvedValue([pedido()]);
      prisma.deliveryLocationPoint.groupBy.mockResolvedValue([
        { driverId: 'driver-1', _max: { capturedAt: minutosAtras(3) } },
      ]);

      await expect(service.listSilentDrivers(agora)).resolves.toEqual([]);
    });

    it('devolve vazio com o detector desligado', async () => {
      settings.get.mockResolvedValue({ locationSilenceAlertMinutes: null });

      await expect(service.listSilentDrivers(agora)).resolves.toEqual([]);
    });
  });
});
