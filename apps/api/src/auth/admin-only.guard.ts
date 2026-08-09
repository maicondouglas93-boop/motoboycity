import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { User } from '@prisma/client';

/** Deve sempre rodar depois de JwtAuthGuard (que popula request.user). */
@Injectable()
export class AdminOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user: User }>();
    if (request.user?.type !== 'ADMIN') {
      throw new ForbiddenException('Acesso restrito a administradores.');
    }
    return true;
  }
}
