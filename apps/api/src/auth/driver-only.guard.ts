import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { User } from '@prisma/client';

/** Deve sempre rodar depois de JwtAuthGuard (que popula request.user). */
@Injectable()
export class DriverOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user: User }>();
    if (request.user?.type !== 'DRIVER') {
      throw new ForbiddenException('Acesso restrito a entregadores.');
    }
    return true;
  }
}
