import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService, type ReadinessResponse } from './health.service';

interface HealthResponse {
  status: 'ok';
}

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check(): HealthResponse {
    return { status: 'ok' };
  }

  /**
   * Readiness aditiva: o healthcheck historico continua sendo liveness e nao
   * muda de comportamento. O provedor so deve apontar para esta rota depois de
   * observar Postgres e Redis estaveis no ambiente real.
   */
  @Get('ready')
  async ready(@Res({ passthrough: true }) response: Response): Promise<ReadinessResponse> {
    const result = await this.healthService.ready();
    response.status(result.status === 'ready' ? 200 : 503);
    return result;
  }
}
