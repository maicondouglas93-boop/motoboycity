import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  const healthService = { ready: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('retorna { status: "ok" }', () => {
    expect(controller.check()).toEqual({ status: 'ok' });
  });

  it('responde readiness 200 quando as dependencias estao saudaveis', async () => {
    healthService.ready.mockResolvedValue({
      status: 'ready',
      checks: { postgres: 'ok', redis: 'ok' },
    });
    const response = { status: jest.fn() };

    await expect(controller.ready(response as never)).resolves.toEqual({
      status: 'ready',
      checks: { postgres: 'ok', redis: 'ok' },
    });
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it('responde readiness 503 sem revelar a causa interna', async () => {
    healthService.ready.mockResolvedValue({
      status: 'not_ready',
      checks: { postgres: 'ok', redis: 'error' },
    });
    const response = { status: jest.fn() };

    await expect(controller.ready(response as never)).resolves.toEqual({
      status: 'not_ready',
      checks: { postgres: 'ok', redis: 'error' },
    });
    expect(response.status).toHaveBeenCalledWith(503);
  });
});
