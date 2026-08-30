import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

/** Nome da rotina de backup na tabela de avisos de vida. */
export const BACKUP_JOB = 'backup-banco';

/**
 * Depois disto, o backup está atrasado. O agendamento é diário; 36 horas dão
 * folga para uma execução atrasar ou o runner do GitHub estar congestionado,
 * sem esconder um dia inteiro perdido.
 */
export const BACKUP_ATRASADO_HORAS = 36;

/** A partir daqui não é atraso, é rotina quebrada e esquecida. */
export const BACKUP_ABANDONADO_DIAS = 7;

@Injectable()
export class JobCheckInService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * O segredo é comparado em tempo constante.
   *
   * Uma comparação com `===` vaza, pelo tempo de resposta, quantos caracteres
   * do começo estão certos — e este endpoint é público por natureza, porque
   * quem chama é um runner sem sessão.
   */
  assertAutorizado(tokenRecebido: string | undefined): void {
    const esperado = this.config.get<string>('JOB_CHECK_IN_TOKEN');
    if (!esperado) {
      throw new UnauthorizedException('Aviso de rotina não está configurado nesta instalação.');
    }
    const recebido = Buffer.from(tokenRecebido ?? '');
    const alvo = Buffer.from(esperado);
    if (recebido.length !== alvo.length || !timingSafeEqual(recebido, alvo)) {
      throw new UnauthorizedException('Token inválido.');
    }
  }

  async registrar(job: string, sizeBytes?: number, detail?: string): Promise<{ ok: true }> {
    await this.prisma.jobCheckIn.upsert({
      where: { id: job },
      create: {
        id: job,
        lastRunAt: new Date(),
        sizeBytes: sizeBytes ?? null,
        detail: detail?.slice(0, 200) ?? null,
      },
      update: {
        lastRunAt: new Date(),
        sizeBytes: sizeBytes ?? null,
        detail: detail?.slice(0, 200) ?? null,
      },
    });
    return { ok: true };
  }

  async ultimoAviso(job: string): Promise<{ lastRunAt: Date; detail: string | null } | null> {
    const registro = await this.prisma.jobCheckIn.findUnique({
      where: { id: job },
      select: { lastRunAt: true, detail: true },
    });
    return registro ?? null;
  }
}
