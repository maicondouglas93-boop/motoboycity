import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { credentialFingerprint } from './credential-fingerprint';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const passwordHash = 'bcrypt-hash-current';
  const prisma = { user: { findUnique: jest.fn() } };
  const config = { getOrThrow: jest.fn().mockReturnValue('test-jwt-secret') };
  const strategy = new JwtStrategy(config as unknown as ConfigService, prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('aceita token emitido para a credencial atual', async () => {
    const user = { id: 'user-1', passwordHash };
    prisma.user.findUnique.mockResolvedValue(user);

    await expect(
      strategy.validate({
        sub: user.id,
        credentialVersion: credentialFingerprint(passwordHash),
      }),
    ).resolves.toBe(user);
  });

  it('rejeita token emitido antes da troca de senha', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', passwordHash });

    await expect(
      strategy.validate({
        sub: 'user-1',
        credentialVersion: credentialFingerprint('bcrypt-hash-old'),
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejeita tokens legados sem versão de credencial', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', passwordHash });

    await expect(strategy.validate({ sub: 'user-1' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
