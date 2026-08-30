import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { JobCheckInService } from './job-check-in.service';

/**
 * Guard, e nao uma checagem dentro do handler.
 *
 * No Nest o pipe de validacao roda ANTES do corpo do metodo: com a checagem
 * dentro do handler, quem nao tem o segredo recebia 400 com as mensagens do
 * schema em vez de 401 — a rota respondia sobre o formato do corpo antes de
 * decidir se aquela pessoa podia falar com ela. Guard roda antes de tudo.
 */
@Injectable()
export class JobTokenGuard implements CanActivate {
  constructor(private readonly service: JobCheckInService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>();
    const token = request.headers['x-job-token'];
    this.service.assertAutorizado(typeof token === 'string' ? token : undefined);
    return true;
  }
}
