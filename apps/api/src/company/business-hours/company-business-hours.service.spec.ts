import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { User } from '@prisma/client';
import { AdminPlatformSettingsService } from '../../admin/platform-settings/admin-platform-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanyBusinessHoursService } from './company-business-hours.service';

const companyUser = { id: 'user-a', type: 'COMPANY_MEMBER' } as User;

/** Segunda-feira, 10:00 em São Paulo (13:00 UTC). */
const SEGUNDA_10H = new Date('2026-08-31T13:00:00.000Z');
/** Segunda-feira, 23:00 em São Paulo — fora de qualquer faixa comercial. */
const SEGUNDA_23H = new Date('2026-09-01T02:00:00.000Z');

describe('horário de funcionamento visto pela loja', () => {
  let prisma: {
    companyTeamMember: { findFirst: jest.Mock };
    businessHour: { findMany: jest.Mock };
  };
  let platformSettings: { get: jest.Mock };

  async function montar() {
    const module = await Test.createTestingModule({
      providers: [
        CompanyBusinessHoursService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdminPlatformSettingsService, useValue: platformSettings },
      ],
    }).compile();
    return module.get(CompanyBusinessHoursService);
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(SEGUNDA_10H);
    prisma = {
      companyTeamMember: {
        findFirst: jest.fn().mockResolvedValue({ company: { regionId: 'regiao-da-loja' } }),
      },
      businessHour: {
        findMany: jest.fn().mockResolvedValue([
          // Segunda a sexta, 08:00 às 18:00.
          ...[1, 2, 3, 4, 5].map((weekday) => ({
            weekday,
            startMinute: 8 * 60,
            endMinute: 18 * 60,
          })),
        ]),
      },
    };
    platformSettings = { get: jest.fn().mockResolvedValue({ businessHoursEnabled: true }) };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('aceita dentro da faixa e devolve as faixas de hoje', async () => {
    const service = await montar();

    await expect(service.status(companyUser)).resolves.toEqual({
      accepting: true,
      nextOpeningLabel: null,
      todayWindows: [{ startMinute: 480, endMinute: 1080 }],
    });
  });

  it('fora da faixa, diz quando abre de novo', async () => {
    jest.setSystemTime(SEGUNDA_23H);
    const service = await montar();

    const status = await service.status(companyUser);

    expect(status.accepting).toBe(false);
    expect(status.nextOpeningLabel).toBe('amanhã às 08:00');
  });

  /**
   * As duas saídas antecipadas de `assertWithinBusinessHours`, repetidas aqui
   * de propósito: se a tela e o bloqueio discordarem, a loja lê "fechado" numa
   * operação que aceita o pedido — ou pior, lê "aberto" e toma a recusa depois
   * de digitar tudo.
   */
  it('interruptor desligado aceita sempre, mesmo às 23h', async () => {
    jest.setSystemTime(SEGUNDA_23H);
    platformSettings.get.mockResolvedValue({ businessHoursEnabled: false });
    const service = await montar();

    await expect(service.status(companyUser)).resolves.toEqual({
      accepting: true,
      nextOpeningLabel: null,
      todayWindows: [],
    });
    // Nem consulta as faixas: o interruptor decide antes.
    expect(prisma.businessHour.findMany).not.toHaveBeenCalled();
  });

  it('interruptor ligado sem nenhuma faixa também aceita sempre', async () => {
    jest.setSystemTime(SEGUNDA_23H);
    prisma.businessHour.findMany.mockResolvedValue([]);
    const service = await montar();

    await expect(service.status(companyUser)).resolves.toMatchObject({ accepting: true });
  });

  /**
   * O admin resolve "a primeira região ativa"; o bloqueio usa a região da
   * empresa. Ler a região errada faria a loja de outra praça ver um horário
   * que não é o dela.
   */
  it('consulta a região da empresa, e não uma região qualquer', async () => {
    const service = await montar();

    await service.status(companyUser);

    expect(prisma.businessHour.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { regionId: 'regiao-da-loja' } }),
    );
  });

  it('não responde a quem não está vinculado a uma empresa', async () => {
    prisma.companyTeamMember.findFirst.mockResolvedValue(null);
    const service = await montar();

    await expect(service.status(companyUser)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
