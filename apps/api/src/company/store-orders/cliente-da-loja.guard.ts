import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getApps, initializeApp, type App } from 'firebase-admin/app';
import type { Request } from 'express';

/**
 * O cliente da loja online: quem entrou com o Google na página da loja, pelo
 * login do Firebase.
 *
 * Não é usuário do sistema de entregas — não tem linha em `users`, não entra no
 * painel. É só o `uid` do Firebase, que diz de quem é cada pedido.
 */
export interface ClienteDaLoja {
  id: string;
}

type ComCliente = Request & { clienteDaLoja?: ClienteDaLoja };

/** Um app só do Firebase para isto, separado do push: um não mexe no outro. */
const NOME_DO_APP = 'motoboycity-clientes-da-loja';

/**
 * Confere o token do login do Firebase. É o mesmo projeto do push
 * (`FIREBASE_PROJECT_ID`), e para conferir o token basta ele: a assinatura é
 * validada com as chaves públicas do Google, sem credencial secreta nenhuma.
 *
 * Fica num serviço à parte para o teste trocar pelo simulado sem precisar de
 * uma conta Google.
 */
@Injectable()
export class VerificadorDoCliente {
  private app: App | null = null;

  constructor(private readonly config: ConfigService) {}

  /** O projeto do Firebase está configurado? Sem ele, pedido pela página não existe. */
  disponivel(): boolean {
    return Boolean(this.projeto());
  }

  /** O id do cliente, ou `null` se o token não vale (vencido, de outro projeto, forjado). */
  async verificar(token: string): Promise<string | null> {
    try {
      // Carregado na primeira conferência, e não ao subir a API: o
      // `firebase-admin/auth` traz o `jose`, que só existe como módulo ES. O
      // Node 22 carrega; o Jest dos testes, não — e lá o verificador é outro.
      const { getAuth } = await import('firebase-admin/auth');
      const decodificado = await getAuth(this.appDoFirebase()).verifyIdToken(token);
      return decodificado.uid || null;
    } catch {
      return null;
    }
  }

  private projeto(): string | undefined {
    return this.config.get<string>('FIREBASE_PROJECT_ID')?.trim() || undefined;
  }

  private appDoFirebase(): App {
    this.app ??=
      getApps().find((item) => item.name === NOME_DO_APP) ??
      initializeApp({ projectId: this.projeto() }, NOME_DO_APP);
    return this.app;
  }
}

/**
 * Exige o cliente logado. Sem o Firebase configurado na API, responde 503 — a
 * página diz que o pedido por ali ainda não está disponível, em vez de o
 * cliente montar a sacola para nada.
 */
@Injectable()
export class ClienteDaLojaGuard implements CanActivate {
  constructor(private readonly verificador: VerificadorDoCliente) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.verificador.disponivel()) {
      throw new ServiceUnavailableException({
        message: 'Pedidos pela página ainda não estão disponíveis.',
        code: 'STORE_ORDERS_UNAVAILABLE',
      });
    }
    const request = context.switchToHttp().getRequest<ComCliente>();
    const token = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1];
    if (!token) {
      throw new UnauthorizedException({
        message: 'Entre com o Google para pedir.',
        code: 'STORE_CUSTOMER_REQUIRED',
      });
    }
    const id = await this.verificador.verificar(token);
    if (!id) {
      throw new UnauthorizedException({
        message: 'Sua sessão expirou. Entre de novo.',
        code: 'STORE_CUSTOMER_INVALID',
      });
    }
    request.clienteDaLoja = { id };
    return true;
  }
}

/** O cliente que o `ClienteDaLojaGuard` conferiu. */
export const ClienteAtual = createParamDecorator(
  (_dado: unknown, context: ExecutionContext): ClienteDaLoja => {
    const cliente = context.switchToHttp().getRequest<ComCliente>().clienteDaLoja;
    if (!cliente) throw new UnauthorizedException('Entre com o Google para pedir.');
    return cliente;
  },
);
