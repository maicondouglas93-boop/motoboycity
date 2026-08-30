import { ForbiddenException, Injectable } from '@nestjs/common';
import type { CompanyBusinessHoursStatus } from '@motoboycity/types';
import type { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminPlatformSettingsService } from '../../admin/platform-settings/admin-platform-settings.service';
import { saoPauloDateParts } from '../../common/sao-paulo-time';
import { checkBusinessHours } from '../../deliveries/business-hours';

/**
 * O mesmo horário que BLOQUEIA, respondido para quem vai criar o pedido.
 *
 * Existe separado do endpoint do admin por duas razões que não são de estilo:
 *
 * 1. **Região.** O admin resolve "a primeira região ativa"; o bloqueio de
 *    verdade usa a região DA EMPRESA (`assertWithinBusinessHours` recebe
 *    `company.regionId`). Reaproveitar o endpoint do admin faria a loja de uma
 *    segunda região ler o horário de outra — e ler "aberto" para depois tomar
 *    recusa no envio.
 * 2. **A resposta.** O admin precisa das faixas para editar; a loja precisa de
 *    uma decisão. Devolver `accepting` já combinado impede que o painel
 *    recomponha a regra e divirja dela.
 */
@Injectable()
export class CompanyBusinessHoursService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettings: AdminPlatformSettingsService,
  ) {}

  async status(user: User): Promise<CompanyBusinessHoursStatus> {
    const membro = await this.prisma.companyTeamMember.findFirst({
      where: { userId: user.id, active: true },
      select: { company: { select: { regionId: true } } },
    });
    if (!membro) {
      throw new ForbiddenException('Usuário não está vinculado a uma empresa.');
    }

    const settings = await this.platformSettings.get();
    /**
     * Interruptor desligado significa aceitar sempre — a mesma primeira linha
     * de `assertWithinBusinessHours`. Se aqui fosse diferente, a loja veria
     * "fechado" numa operação que aceita o pedido normalmente.
     */
    if (!settings.businessHoursEnabled) {
      return { accepting: true, nextOpeningLabel: null, todayWindows: [] };
    }

    const windows = await this.prisma.businessHour.findMany({
      where: { regionId: membro.company.regionId },
      select: { weekday: true, startMinute: true, endMinute: true },
      orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
    });
    /**
     * Nenhuma faixa cadastrada também é "aceita sempre". Quem ligou o
     * interruptor e não configurou nada não pode ter os pedidos recusados por
     * omissão, e é assim que a criação já se comporta.
     */
    if (windows.length === 0) {
      return { accepting: true, nextOpeningLabel: null, todayWindows: [] };
    }

    const agora = new Date();
    const { open, nextOpeningLabel } = checkBusinessHours(windows, agora);
    const hoje = saoPauloDateParts(agora).weekday;

    return {
      accepting: open,
      nextOpeningLabel,
      todayWindows: windows
        .filter((window) => window.weekday === hoje)
        .map(({ startMinute, endMinute }) => ({ startMinute, endMinute })),
    };
  }
}
