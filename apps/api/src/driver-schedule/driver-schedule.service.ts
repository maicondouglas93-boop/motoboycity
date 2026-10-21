import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  DriverScheduleView,
  DriverWorkSchedule,
  DriverWorkScheduleStatus,
} from '@motoboycity/types';
import {
  DIAS_DA_SEMANA,
  ORDEM_DA_SEMANA,
  driverWorkScheduleSchema,
  mensagemForaDaEscala,
  situacaoDaEscala,
  textoDoTurno,
  turnosEmOrdem,
} from '@motoboycity/validation';
import { AdminAuditService } from '../admin/audit/admin-audit.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * A escala do motoboy: a semana fixa em que ele pode trabalhar.
 *
 * Fica FORA de `DispatchService` pelo mesmo motivo da punicao: o despacho e o
 * lugar onde uma regra errada para a operacao inteira, e aqui a regra pode ser
 * lida e testada sozinha. O despacho so pergunta "quem esta fora do turno?".
 *
 * Escala e opcional. Quem nao tem trabalha livre, a qualquer hora — e assim que
 * a funcao entra no ar sem tirar ninguem da rua.
 */
@Injectable()
export class DriverScheduleService {
  private readonly logger = new Logger(DriverScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  /**
   * A escala gravada, ou `null`.
   *
   * O JSON e conferido de novo na leitura. Um registro que nao passa vira "sem
   * escala", com aviso no log: barrar o motoboy por causa de um dado quebrado o
   * tiraria da rua sem ninguem entender por que, e o pedido do cliente fica
   * esperando.
   */
  parse(raw: Prisma.JsonValue | null | undefined, driverId?: string): DriverWorkSchedule | null {
    if (raw === null || raw === undefined) return null;
    const lida = driverWorkScheduleSchema.safeParse(raw);
    if (!lida.success) {
      this.logger.warn(
        `Escala ilegivel${driverId ? ` do motoboy ${driverId}` : ''}; tratada como sem escala.`,
      );
      return null;
    }
    return lida.data;
  }

  /** Onde a escala esta agora, ou `null` para quem nao tem escala. */
  statusOf(
    raw: Prisma.JsonValue | null | undefined,
    agora: Date = new Date(),
    driverId?: string,
  ): DriverWorkScheduleStatus | null {
    const escala = this.parse(raw, driverId);
    return escala ? situacaoDaEscala(escala, agora) : null;
  }

  /** Onde o motoboy esta na escala agora, ou `null` se ele nao tem escala. */
  async statusForDriver(
    driverId: string,
    agora: Date = new Date(),
  ): Promise<DriverWorkScheduleStatus | null> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { workSchedule: true },
    });
    return this.statusOf(driver?.workSchedule, agora, driverId);
  }

  /** Tem escala e esta fora do turno agora. Sem escala, nunca. */
  async isOffShift(driverId: string, agora: Date = new Date()): Promise<boolean> {
    return (await this.offShiftMessage(driverId, agora)) !== null;
  }

  /**
   * A frase para quem esta fora do turno ("O próximo turno começa sexta às
   * 11:00."), ou `null` se ele pode trabalhar agora — no turno, ou sem escala.
   */
  async offShiftMessage(driverId: string, agora: Date = new Date()): Promise<string | null> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { workSchedule: true },
    });
    const escala = this.parse(driver?.workSchedule, driverId);
    if (!escala || situacaoDaEscala(escala, agora).onShift) return null;
    return mensagemForaDaEscala(escala, agora);
  }

  /**
   * Motoboys Ativos, com escala, e fora do turno agora — para o despacho excluir.
   *
   * Devolve IDs, como a punicao, porque o despacho escolhe candidatos por
   * `DriverPresenceLog` e ja exclui com um `notIn`. A conta do turno nao cabe
   * num `where` (e relogio de Brasilia sobre JSON), entao e feita aqui, sobre
   * a lista curta de quem esta Ativo e tem escala.
   */
  async offShiftDriverIds(agora: Date = new Date()): Promise<string[]> {
    const drivers = await this.prisma.driver.findMany({
      where: { availability: 'AVAILABLE', workSchedule: { not: Prisma.DbNull } },
      select: { id: true, workSchedule: true },
    });
    return drivers
      .filter((driver) => {
        const status = this.statusOf(driver.workSchedule, agora, driver.id);
        return status !== null && !status.onShift;
      })
      .map((driver) => driver.id);
  }

  /** O que a tela Escala do aplicativo mostra. */
  async viewForDriver(driverId: string, agora: Date = new Date()): Promise<DriverScheduleView> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { workSchedule: true },
    });
    const escala = this.parse(driver?.workSchedule, driverId);
    return { schedule: escala, status: escala ? situacaoDaEscala(escala, agora) : null };
  }

  /**
   * Grava a escala que a central montou, ou remove (`null`).
   *
   * Nao mexe na presenca: quem esta Ativo continua Ativo. Se a escala nova o
   * deixa fora do turno, ele sai do despacho na proxima escolha de motoboy e
   * termina o que ja aceitou — a mesma regra do fim de turno.
   */
  async replaceByAdmin(
    driverId: string,
    escala: DriverWorkSchedule | null,
    actorUserId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const driver = await tx.driver.findUnique({
        where: { id: driverId },
        select: { user: { select: { name: true } } },
      });
      if (!driver) throw new NotFoundException('Motoboy nao encontrado.');

      await tx.driver.update({
        where: { id: driverId },
        data: {
          workSchedule: escala ? (escala as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      });
      await this.audit.record(
        {
          actorUserId,
          action: 'DRIVER_SCHEDULE_CHANGED',
          entityType: 'DRIVER',
          entityId: driverId,
          summary: escala
            ? `Escala do motoboy ${driver.user.name}: ${resumoDaEscala(escala)}.`
            : `Escala do motoboy ${driver.user.name} removida: ele volta a trabalhar a qualquer hora.`,
        },
        tx,
      );
    });
  }
}

/** "segunda 11:00 às 15:00 e 18:00 às 23:00; sexta 18:00 às 02:00 do dia seguinte". */
export function resumoDaEscala(escala: DriverWorkSchedule): string {
  return ORDEM_DA_SEMANA.flatMap((weekday) => {
    const turnos = escala.days.find((dia) => dia.weekday === weekday)?.shifts ?? [];
    if (turnos.length === 0) return [];
    const nome = (DIAS_DA_SEMANA[weekday] ?? '').toLowerCase();
    return [`${nome} ${turnosEmOrdem(turnos).map(textoDoTurno).join(' e ')}`];
  }).join('; ');
}
