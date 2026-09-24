import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ProtectablePageRoute } from '@motoboycity/types';
import type { User } from '@prisma/client';
import { PAGE_PROTECTION_KEY } from './page-protection.constants';
import { PageProtectionService } from './page-protection.service';

@Injectable()
export class PageProtectionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly pageProtectionService: PageProtectionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const routeKey = this.reflector.getAllAndOverride<ProtectablePageRoute | undefined>(
      PAGE_PROTECTION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!routeKey) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: User;
      headers: Record<string, string | string[] | undefined>;
    }>();

    const user = request.user;
    if (!user || user.type !== 'COMPANY_MEMBER') {
      return true;
    }

    const companyId = await this.pageProtectionService.resolveCompanyId(user);
    const rawHeader = request.headers['x-page-unlock-token'];
    const unlockToken = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    const unlocked = await this.pageProtectionService.isUnlocked(
      companyId,
      routeKey,
      unlockToken,
    );

    if (!unlocked) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Esta página está protegida por senha. Desbloqueie para continuar.',
        code: 'PAGE_PROTECTION_REQUIRED',
        routeKey,
      });
    }

    return true;
  }
}
