import type Redis from 'ioredis';
import { AiqfomeOAuthStateService } from './aiqfome-oauth-state.service';

describe('AiqfomeOAuthStateService', () => {
  const companyId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';
  const integrationId = '33333333-3333-4333-8333-333333333333';
  const oauthAttemptId = '44444444-4444-4444-8444-444444444444';

  it('grava state opaco com TTL e o consome uma unica vez', async () => {
    const redis = {
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest
        .fn()
        .mockResolvedValueOnce(
          JSON.stringify({
            companyId,
            userId,
            integrationId,
            oauthAttemptId,
            createdAt: '2026-08-27T20:00:00.000Z',
          }),
        )
        .mockResolvedValueOnce(null),
      quit: jest.fn().mockResolvedValue('OK'),
    } as unknown as Redis;
    const service = new AiqfomeOAuthStateService(redis);

    const state = await service.create({ companyId, userId, integrationId, oauthAttemptId });

    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining(state),
      expect.any(String),
      'EX',
      600,
      'NX',
    );
    await expect(service.consume(state)).resolves.toMatchObject({
      companyId,
      userId,
      integrationId,
      oauthAttemptId,
    });
    await expect(service.consume(state)).resolves.toBeNull();
  });

  it('rejeita state fora do formato sem consultar o Redis', async () => {
    const redis = {
      eval: jest.fn(),
      quit: jest.fn().mockResolvedValue('OK'),
    } as unknown as Redis;
    const service = new AiqfomeOAuthStateService(redis);

    await expect(service.consume('state curto')).resolves.toBeNull();
    expect(redis.eval).not.toHaveBeenCalled();
  });
});
