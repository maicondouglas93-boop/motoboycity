import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { credentialFingerprint } from './credential-fingerprint';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const passwordHash = 'bcrypt-hash-current';
  const prisma = {
    user: { findUnique: jest.fn() },
    companyTeamMember: { findFirst: jest.fn() },
  };
  const config = { getOrThrow: jest.fn().mockReturnValue('test-jwt-secret') };
  const strategy = new JwtStrategy(config as unknown as ConfigService, prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('aceita token emitido para a credencial atual', async () => {
    const user = { id: 'user-1', type: 'ADMIN', passwordHash };
    prisma.user.findUnique.mockResolvedValue(user);

    await expect(
      strategy.validate({
        sub: user.id,
        credentialVersion: credentialFingerprint(passwordHash),
      }),
    ).resolves.toBe(user);
  });

  it('aceita membro de empresa somente quando o vínculo está ativo', async () => {
    const user = { id: 'user-company', type: 'COMPANY_MEMBER', passwordHash };
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.companyTeamMember.findFirst.mockResolvedValue({ id: 'membership-1' });

    await expect(
      strategy.validate({
        sub: user.id,
        credentialVersion: credentialFingerprint(passwordHash),
      }),
    ).resolves.toBe(user);

    expect(prisma.companyTeamMember.findFirst).toHaveBeenCalledWith({
      where: { userId: user.id, active: true },
      select: { id: true },
    });
  });

  it('invalida a sessão quando o vínculo com a empresa foi desativado', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-company',
      type: 'COMPANY_MEMBER',
      passwordHash,
    });
    prisma.companyTeamMember.findFirst.mockResolvedValue(null);

    await expect(
      strategy.validate({
        sub: 'user-company',
        credentialVersion: credentialFingerprint(passwordHash),
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
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
