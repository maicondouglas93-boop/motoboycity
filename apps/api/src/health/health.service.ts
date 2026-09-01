import { Injectable } from '@nestjs/common';
import { LiveDriverPresenceService } from '../live-presence/live-driver-presence.service';
import { PrismaService } from '../prisma/prisma.service';

type DependencyStatus = 'ok' | 'error';

export interface ReadinessResponse {
  status: 'ready' | 'not_ready';
  checks: {
    postgres: DependencyStatus;
    redis: DependencyStatus;
  };
}

const DEFAULT_READINESS_TIMEOUT_MS = 1_500;

function readinessTimeoutMs(): number {
  const configured = Number(process.env['READINESS_TIMEOUT_MS']);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_READINESS_TIMEOUT_MS;
}

@Injectable()
export class HealthService {
  private readonly timeoutMs = readinessTimeoutMs();

  constructor(
    private readonly prisma: PrismaService,
    private readonly livePresence: LiveDriverPresenceService,
  ) {}

  async ready(): Promise<ReadinessResponse> {
    const [postgres, redis] = await Promise.all([
      this.check(() => this.prisma.$queryRaw`SELECT 1`),
      this.check(() => this.livePresence.ping()),
    ]);
    return {
      status: postgres === 'ok' && redis === 'ok' ? 'ready' : 'not_ready',
      checks: { postgres, redis },
    };
  }

  private async check(operation: () => Promise<unknown>): Promise<DependencyStatus> {
    let timer: NodeJS.Timeout | null = null;
    try {
      await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('readiness timeout')), this.timeoutMs);
          timer.unref();
        }),
      ]);
      return 'ok';
    } catch {
      return 'error';
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
