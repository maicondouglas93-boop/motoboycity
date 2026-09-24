import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { User } from '@prisma/client';
import { PageProtectionGuard } from './page-protection.guard';
import { PageProtectionService } from './page-protection.service';

describe('PageProtectionGuard', () => {
  let guard: PageProtectionGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let pageProtectionService: {
    resolveCompanyId: jest.Mock;
    isUnlocked: jest.Mock;
  };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    pageProtectionService = {
      resolveCompanyId: jest.fn(),
      isUnlocked: jest.fn(),
    };
    guard = new PageProtectionGuard(reflector as unknown as Reflector, pageProtectionService as unknown as PageProtectionService);
  });

  const createMockContext = (user?: Partial<User>, headers: Record<string, string | undefined> = {}) => {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          headers,
        }),
      }),
    } as unknown as ExecutionContext;
  };

  it('permite a requisicao se a rota nao exigir protecao de pagina', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = createMockContext({ id: 'u-1', type: 'COMPANY_MEMBER' } as User);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(pageProtectionService.isUnlocked).not.toHaveBeenCalled();
  });

  it('permite a requisicao se o usuario nao for membro de empresa', async () => {
    reflector.getAllAndOverride.mockReturnValue('FINANCEIRO');
    const context = createMockContext({ id: 'u-2', type: 'DRIVER' } as User);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(pageProtectionService.isUnlocked).not.toHaveBeenCalled();
  });

  it('permite a requisicao se a pagina estiver desbloqueada', async () => {
    reflector.getAllAndOverride.mockReturnValue('FINANCEIRO');
    pageProtectionService.resolveCompanyId.mockResolvedValue('comp-1');
    pageProtectionService.isUnlocked.mockResolvedValue(true);

    const context = createMockContext(
      { id: 'u-1', type: 'COMPANY_MEMBER' } as User,
      { 'x-page-unlock-token': 'valid-token' },
    );

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(pageProtectionService.isUnlocked).toHaveBeenCalledWith('comp-1', 'FINANCEIRO', 'valid-token');
  });

  it('lanca ForbiddenException se a pagina estiver bloqueada', async () => {
    reflector.getAllAndOverride.mockReturnValue('FINANCEIRO');
    pageProtectionService.resolveCompanyId.mockResolvedValue('comp-1');
    pageProtectionService.isUnlocked.mockResolvedValue(false);

    const context = createMockContext(
      { id: 'u-1', type: 'COMPANY_MEMBER' } as User,
      { 'x-page-unlock-token': 'invalid-token' },
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
