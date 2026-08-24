import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminOnlyGuard } from '../../auth/admin-only.guard';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { VirtualSecretaryController } from './virtual-secretary.controller';

describe('VirtualSecretaryController security', () => {
  it('declara autenticação JWT e acesso exclusivo de admin', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, VirtualSecretaryController) as unknown[];
    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, AdminOnlyGuard]));
  });

  it('AdminOnlyGuard recusa usuário de empresa', () => {
    const guard = new AdminOnlyGuard();
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ user: { type: 'COMPANY' } }) }),
    };

    expect(() => guard.canActivate(context as never)).toThrow(ForbiddenException);
  });
});
