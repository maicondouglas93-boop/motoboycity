import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { AdminAuditService } from '../admin/audit/admin-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { DriverScheduleService, resumoDaEscala } from './driver-schedule.service';

/**
 * Segunda das 11:00 as 15:00 e das 18:00 as 23:00; sexta das 18:00 as 02:00 do
 * sabado. Os instantes abaixo estao em UTC; Brasilia e UTC-3.
 */
const ESCALA = {
  days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    shifts:
      weekday === 1
        ? [
            { start: '18:00', end: '23:00' },
            { start: '11:00', end: '15:00' },
          ]
        : weekday === 5
          ? [{ start: '18:00', end: '02:00' }]
          : [],
  })),
};

/** Segunda, 12/10/2026, 12:30 em Brasilia: no turno do almoco. */
const SEGUNDA_NO_ALMOCO = new Date('2026-10-12T15:30:00.000Z');
/** Segunda, 16:00 em Brasilia: entre o almoco e o jantar. */
const SEGUNDA_NO_INTERVALO = new Date('2026-10-12T19:00:00.000Z');
/** Sabado, 01:30 em Brasilia: ainda no turno de sexta, que vai ate as 02:00. */
const MADRUGADA_DE_SABADO = new Date('2026-10-17T04:30:00.000Z');

describe('DriverScheduleService', () => {
  let service: DriverScheduleService;
  let prisma: {
    driver: { findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      driver: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      $transaction: jest
        .fn()
        .mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma)),
    };
    audit = { record: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverScheduleService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdminAuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(DriverScheduleService);
  });

  describe('statusOf', () => {
    it('sem escala: null — o motoboy trabalha livre', () => {
      expect(service.statusOf(null, SEGUNDA_NO_ALMOCO)).toBeNull();
    });

    it('no turno: diz até quando', () => {
      expect(service.statusOf(ESCALA, SEGUNDA_NO_ALMOCO)).toEqual({
        onShift: true,
        changesAt: '2026-10-12T18:00:00.000Z',
        label: 'No turno até 15:00',
      });
    });

    it('fora do turno: diz quando é o próximo', () => {
      expect(service.statusOf(ESCALA, SEGUNDA_NO_INTERVALO)).toEqual({
        onShift: false,
        changesAt: '2026-10-12T21:00:00.000Z',
        label: 'Fora da escala · próximo turno hoje às 18:00',
      });
    });

    it('turno que passa da meia-noite ainda vale na madrugada do dia seguinte', () => {
      expect(service.statusOf(ESCALA, MADRUGADA_DE_SABADO)).toMatchObject({
        onShift: true,
        label: 'No turno até 02:00',
      });
    });

    it('escala gravada ilegível vira "sem escala", e não barra o motoboy', () => {
      expect(service.statusOf({ days: 'quebrado' }, SEGUNDA_NO_INTERVALO)).toBeNull();
    });
  });

  describe('offShiftMessage / isOffShift', () => {
    it('fora do turno: a frase diz quando ele pode voltar', async () => {
      prisma.driver.findUnique.mockResolvedValue({ workSchedule: ESCALA });

      await expect(service.offShiftMessage('driver-1', SEGUNDA_NO_INTERVALO)).resolves.toBe(
        'Você está fora da sua escala. O próximo turno começa hoje às 18:00.',
      );
      await expect(service.isOffShift('driver-1', SEGUNDA_NO_INTERVALO)).resolves.toBe(true);
    });

    it('no turno, ou sem escala: null', async () => {
      prisma.driver.findUnique.mockResolvedValueOnce({ workSchedule: ESCALA });
      await expect(service.offShiftMessage('driver-1', SEGUNDA_NO_ALMOCO)).resolves.toBeNull();

      prisma.driver.findUnique.mockResolvedValueOnce({ workSchedule: null });
      await expect(service.isOffShift('driver-1', SEGUNDA_NO_INTERVALO)).resolves.toBe(false);
    });
  });

  describe('offShiftDriverIds', () => {
    it('só os Ativos com escala e fora do turno', async () => {
      prisma.driver.findMany.mockResolvedValue([
        { id: 'fora-do-turno', workSchedule: ESCALA },
        {
          id: 'no-turno',
          workSchedule: {
            days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
              weekday,
              shifts: [{ start: '15:00', end: '17:00' }],
            })),
          },
        },
        { id: 'escala-quebrada', workSchedule: { days: [] } },
      ]);

      await expect(service.offShiftDriverIds(SEGUNDA_NO_INTERVALO)).resolves.toEqual([
        'fora-do-turno',
      ]);
      expect(prisma.driver.findMany).toHaveBeenCalledWith({
        where: { availability: 'AVAILABLE', workSchedule: { not: Prisma.DbNull } },
        select: { id: true, workSchedule: true },
      });
    });
  });

  describe('replaceByAdmin', () => {
    it('grava a escala e registra na auditoria o que ficou valendo', async () => {
      prisma.driver.findUnique.mockResolvedValue({ user: { name: 'Motoboy Um' } });

      await service.replaceByAdmin('driver-1', ESCALA, 'admin-1');

      expect(prisma.driver.update).toHaveBeenCalledWith({
        where: { id: 'driver-1' },
        data: { workSchedule: ESCALA },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'admin-1',
          action: 'DRIVER_SCHEDULE_CHANGED',
          entityType: 'DRIVER',
          entityId: 'driver-1',
          summary:
            'Escala do motoboy Motoboy Um: segunda 11:00 às 15:00 e 18:00 às 23:00; ' +
            'sexta 18:00 às 02:00 do dia seguinte.',
        }),
        prisma,
      );
    });

    it('remover grava NULL no banco: ele volta a trabalhar livre', async () => {
      prisma.driver.findUnique.mockResolvedValue({ user: { name: 'Motoboy Um' } });

      await service.replaceByAdmin('driver-1', null, 'admin-1');

      expect(prisma.driver.update).toHaveBeenCalledWith({
        where: { id: 'driver-1' },
        data: { workSchedule: Prisma.DbNull },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          summary:
            'Escala do motoboy Motoboy Um removida: ele volta a trabalhar a qualquer hora.',
        }),
        prisma,
      );
    });

    it('motoboy que não existe: 404, e nada é gravado', async () => {
      prisma.driver.findUnique.mockResolvedValue(null);

      await expect(service.replaceByAdmin('driver-x', ESCALA, 'admin-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.driver.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('viewForDriver', () => {
    it('devolve a semana e onde ele está nela', async () => {
      prisma.driver.findUnique.mockResolvedValue({ workSchedule: ESCALA });

      const view = await service.viewForDriver('driver-1', SEGUNDA_NO_ALMOCO);

      expect(view.schedule).toEqual(ESCALA);
      expect(view.status).toMatchObject({ onShift: true, label: 'No turno até 15:00' });
    });

    it('sem escala: os dois campos vazios', async () => {
      prisma.driver.findUnique.mockResolvedValue({ workSchedule: null });

      await expect(service.viewForDriver('driver-1', SEGUNDA_NO_ALMOCO)).resolves.toEqual({
        schedule: null,
        status: null,
      });
    });
  });

  it('resumoDaEscala lista na ordem da semana de trabalho, com os turnos em ordem', () => {
    expect(resumoDaEscala(ESCALA)).toBe(
      'segunda 11:00 às 15:00 e 18:00 às 23:00; sexta 18:00 às 02:00 do dia seguinte',
    );
  });
});
