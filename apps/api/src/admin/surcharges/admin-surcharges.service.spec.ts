import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { AdminSurchargesService } from './admin-surcharges.service';
import { RainWeatherService } from '../../weather/rain-weather.service';
import { ConflictException } from '@nestjs/common';
import { setSurchargeRainAutomationSchema } from '@motoboycity/validation';
import { Prisma } from '@prisma/client';

describe('AdminSurchargesService', () => {
  let service: AdminSurchargesService;
  let audit: { record: jest.Mock };
  let rainWeather: { forSurcharge: jest.Mock };
  let tx: {
    surcharge: {
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      delete: jest.Mock;
    };
    surchargeSchedule: { deleteMany: jest.Mock };
  };
  let prisma: {
    region: { findFirst: jest.Mock };
    surcharge: { findMany: jest.Mock; findUnique: jest.Mock };
    $transaction: jest.Mock;
  };

  const surchargeRow = {
    id: 'surcharge-1',
    name: 'Chuva',
    type: 'FIXED' as const,
    value: { toString: () => '4.50' },
    driverSharePercentage: { toString: () => '80' },
    active: true,
    manuallyActive: false,
    automaticRainEnabled: false,
    createdAt: new Date('2026-08-25T12:00:00.000Z'),
    schedules: [],
  };

  beforeEach(async () => {
    tx = {
      surcharge: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn(),
        delete: jest.fn(),
      },
      surchargeSchedule: { deleteMany: jest.fn() },
    };
    prisma = {
      region: { findFirst: jest.fn() },
      surcharge: { findMany: jest.fn(), findUnique: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (callback) => callback(tx)),
    };
    audit = { record: jest.fn() };
    rainWeather = { forSurcharge: jest.fn().mockReturnValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminSurchargesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdminAuditService, useValue: audit },
        { provide: RainWeatherService, useValue: rainWeather },
      ],
    }).compile();

    service = module.get(AdminSurchargesService);
  });

  it('mostra no ADM a mesma ativação climática da precificação sem mudar o manual', async () => {
    prisma.surcharge.findMany.mockResolvedValue([{ ...surchargeRow, automaticRainEnabled: true }]);
    rainWeather.forSurcharge.mockReturnValue({ activeNow: true, status: 'RAINING' });
    const [result] = await service.list();
    expect(result).toMatchObject({
      activeNow: true,
      manuallyActive: false,
      automaticRainEnabled: true,
      rainAutomation: { activeNow: true, status: 'RAINING' },
    });
    expect(tx.surcharge.update).not.toHaveBeenCalled();
  });

  it('mostra taxa desativada mesmo com chuva', async () => {
    prisma.surcharge.findMany.mockResolvedValue([
      { ...surchargeRow, active: false, automaticRainEnabled: true },
    ]);
    rainWeather.forSurcharge.mockReturnValue({ activeNow: true, status: 'RAINING' });
    expect((await service.list())[0]!.activeNow).toBe(false);
  });

  it('modo manual mostra clima sem aplicar a taxa', async () => {
    prisma.surcharge.findMany.mockResolvedValue([surchargeRow]);
    rainWeather.forSurcharge.mockReturnValue({ activeNow: true, status: 'RAINING' });
    expect((await service.list())[0]).toMatchObject({
      automaticRainEnabled: false,
      activeNow: false,
    });
  });

  it.each([null, { status: 'DISABLED' }, { status: 'NOT_CONFIGURED' }])(
    'recusa automático sem vínculo/habilitação: %j',
    async (weather) => {
      prisma.surcharge.findUnique.mockResolvedValue(surchargeRow);
      rainWeather.forSurcharge.mockReturnValue(weather);
      await expect(
        service.setRainAutomation('surcharge-1', true, 'admin-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.surcharge.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    },
  );

  it('ativa o modo automático, limpa manual e audita sem mudar preço ou horários', async () => {
    prisma.surcharge.findUnique.mockResolvedValue({ ...surchargeRow, manuallyActive: true });
    rainWeather.forSurcharge.mockReturnValue({ status: 'RAINING', activeNow: true });
    tx.surcharge.findUniqueOrThrow.mockResolvedValue({
      ...surchargeRow,
      automaticRainEnabled: true,
    });
    const result = await service.setRainAutomation('surcharge-1', true, 'admin-1');
    expect(result).toMatchObject({
      automaticRainEnabled: true,
      manuallyActive: false,
      activeNow: true,
    });
    expect(tx.surcharge.updateMany).toHaveBeenCalledWith({
      where: { id: 'surcharge-1', automaticRainEnabled: false },
      data: { automaticRainEnabled: true, manuallyActive: false },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'admin-1',
        action: 'SURCHARGE_UPDATED',
        summary: expect.stringContaining('automático de chuva ativado'),
      }),
      tx,
    );
    expect(tx.surchargeSchedule.deleteMany).not.toHaveBeenCalled();
  });

  it('permite preparar o automático sem dados recentes, sem cobrar nem reativar taxa desativada', async () => {
    prisma.surcharge.findUnique.mockResolvedValue({ ...surchargeRow, active: false });
    rainWeather.forSurcharge.mockReturnValue({ status: 'UNAVAILABLE', activeNow: false });
    tx.surcharge.findUniqueOrThrow.mockResolvedValue({
      ...surchargeRow,
      active: false,
      automaticRainEnabled: true,
    });
    expect(await service.setRainAutomation('surcharge-1', true, 'admin-1')).toMatchObject({
      active: false,
      activeNow: false,
      automaticRainEnabled: true,
    });
    expect(tx.surcharge.updateMany.mock.calls[0][0].data).not.toHaveProperty('active');
  });

  it('desliga automático mesmo com integração indisponível, sem religar manual antigo', async () => {
    prisma.surcharge.findUnique.mockResolvedValue({ ...surchargeRow, automaticRainEnabled: true });
    tx.surcharge.findUniqueOrThrow.mockResolvedValue(surchargeRow);
    expect(await service.setRainAutomation('surcharge-1', false, 'admin-1')).toMatchObject({
      automaticRainEnabled: false,
      manuallyActive: false,
      activeNow: false,
    });
    expect(tx.surcharge.updateMany.mock.calls[0][0].data).toEqual({
      automaticRainEnabled: false,
      manuallyActive: false,
    });
  });

  it('recusa manual no automático tanto no interruptor quanto na edição', async () => {
    prisma.surcharge.findUnique.mockResolvedValue({ ...surchargeRow, automaticRainEnabled: true });
    await expect(service.setManuallyActive('surcharge-1', true, 'admin-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(
      service.update(
        'surcharge-1',
        {
          name: 'Chuva',
          type: 'FIXED',
          value: 4.5,
          manuallyActive: true,
        },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.surcharge.update).not.toHaveBeenCalled();
  });

  it('protege a escrita manual de mudança concorrente para automático/desativada', async () => {
    prisma.surcharge.findUnique.mockResolvedValue(surchargeRow);
    tx.surcharge.update.mockResolvedValue({ ...surchargeRow, manuallyActive: true });
    await service.setManuallyActive('surcharge-1', true, 'admin-1');
    expect(tx.surcharge.update.mock.calls[0][0].where).toEqual({
      id: 'surcharge-1',
      active: true,
      automaticRainEnabled: false,
    });
  });

  it('repetir seleção Manual preserva manual ligado depois e não duplica auditoria', async () => {
    prisma.surcharge.findUnique.mockResolvedValue(surchargeRow);
    tx.surcharge.updateMany.mockResolvedValue({ count: 0 });
    tx.surcharge.findUniqueOrThrow.mockResolvedValue({ ...surchargeRow, manuallyActive: true });
    expect(await service.setRainAutomation('surcharge-1', false, 'admin-1')).toMatchObject({
      manuallyActive: true,
      automaticRainEnabled: false,
      activeNow: true,
    });
    expect(audit.record).not.toHaveBeenCalled();
    expect(tx.surcharge.updateMany.mock.calls[0][0].where).toEqual({
      id: 'surcharge-1',
      automaticRainEnabled: true,
    });
  });

  it('mudança concorrente não vira erro interno nem audita uma ativação recusada', async () => {
    prisma.surcharge.findUnique.mockResolvedValue(surchargeRow);
    tx.surcharge.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('gone', { code: 'P2025', clientVersion: '6' }),
    );
    await expect(service.setManuallyActive('surcharge-1', true, 'admin-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('contrato de modo exige boolean explícito e não aceita preço/ativação geral', () => {
    for (const input of [
      {},
      { enabled: null },
      { enabled: 'false' },
      { enabled: true, value: 100 },
      { enabled: true, active: true },
    ]) {
      expect(setSurchargeRainAutomationSchema.safeParse(input).success).toBe(false);
    }
    expect(setSurchargeRainAutomationSchema.parse({ enabled: false })).toEqual({ enabled: false });
  });

  it('cria a taxa e a auditoria na mesma transação', async () => {
    prisma.region.findFirst.mockResolvedValue({ id: 'region-1' });
    tx.surcharge.create.mockResolvedValue(surchargeRow);

    const result = await service.create(
      {
        name: 'Chuva',
        type: 'FIXED',
        value: 4.5,
        driverSharePercentage: 80,
        schedules: [],
      },
      'admin-1',
    );

    expect(result.name).toBe('Chuva');
    expect(tx.surcharge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ regionId: 'region-1', name: 'Chuva', value: 4.5 }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'admin-1',
        action: 'SURCHARGE_CREATED',
        entityType: 'SURCHARGE',
        entityId: 'surcharge-1',
      }),
      tx,
    );
  });

  it('desativa a taxa, desliga o manual e registra a ação', async () => {
    prisma.surcharge.findUnique.mockResolvedValue(surchargeRow);
    tx.surcharge.update.mockResolvedValue({ ...surchargeRow, active: false });

    const result = await service.setActive('surcharge-1', false, 'admin-1');

    expect(result.active).toBe(false);
    expect(tx.surcharge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'surcharge-1' },
        data: { active: false, manuallyActive: false },
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SURCHARGE_DEACTIVATED', entityId: 'surcharge-1' }),
      tx,
    );
  });

  it('exclui a taxa e preserva o nome no histórico', async () => {
    prisma.surcharge.findUnique.mockResolvedValue(surchargeRow);

    await service.remove('surcharge-1', 'admin-1');

    expect(tx.surcharge.delete).toHaveBeenCalledWith({ where: { id: 'surcharge-1' } });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'admin-1',
        action: 'SURCHARGE_DELETED',
        entityType: 'SURCHARGE',
        entityId: 'surcharge-1',
        summary: 'Taxa adicional Chuva excluída.',
      }),
      tx,
    );
  });
});
