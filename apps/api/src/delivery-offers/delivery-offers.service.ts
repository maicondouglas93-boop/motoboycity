import { ForbiddenException, Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { DispatchService } from '../dispatch/dispatch.service';
import { PrismaService } from '../prisma/prisma.service';

export interface AcceptOfferResult {
  deliveryId: string;
  displayNumber: number;
}

@Injectable()
export class DeliveryOffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatchService: DispatchService,
  ) {}

  async accept(user: User, offerId: string): Promise<AcceptOfferResult> {
    const driver = await this.findDriverForUser(user);
    return this.dispatchService.acceptOffer(offerId, driver.id, user.id);
  }

  /**
   * Os pedidos que ninguem aceitou e ficaram sem oferta pendente.
   *
   * A mesma checagem de aprovado e ativo do aceite: quem foi bloqueado nao pode
   * contornar a decisao do admin entrando pela vitrine.
   */
  async listAvailable(user: User) {
    const driver = await this.findDriverForUser(user);
    return this.dispatchService.listAvailableForDriver(driver.id);
  }

  /**
   * A oferta que esta esperando resposta agora, se houver.
   *
   * O aplicativo chama isto ao abrir. Sem ele, uma oferta criada com o
   * aplicativo fechado so existia no socket que ninguem estava ouvindo — o
   * motoboy tocava a notificacao, entrava, e encontrava a tela vazia com o
   * prazo correndo.
   */
  async pending(user: User) {
    const driver = await this.findDriverForUser(user);
    return this.dispatchService.findPendingOfferForDriver(driver.id);
  }

  async claim(user: User, deliveryId: string): Promise<AcceptOfferResult> {
    const driver = await this.findDriverForUser(user);
    return this.dispatchService.claimDelivery(deliveryId, driver.id, user.id);
  }

  async decline(user: User, offerId: string): Promise<{ ok: true }> {
    const driver = await this.findDriverForUser(user);
    await this.dispatchService.declineOffer(offerId, driver.id);
    return { ok: true };
  }

  private async findDriverForUser(user: User) {
    if (user.type !== 'DRIVER') {
      throw new ForbiddenException('Acesso restrito a entregadores.');
    }
    const driver = await this.prisma.driver.findUnique({ where: { userId: user.id } });
    if (!driver) {
      throw new ForbiddenException('Usuário não está vinculado a um cadastro de motoboy.');
    }
    // P1-03: presença e despacho já barravam quem não está aprovado/ativo, mas o aceite
    // não olhava nada disso. Quem fosse bloqueado segurando uma oferta ainda conseguia
    // aceitá-la e assumir o pedido — a janela era pequena, e é exatamente a que a decisão
    // do admin precisa fechar. Vale para recusar também, para o motoboy impedido não
    // continuar operando a fila de nenhum lado.
    if (driver.approvalStatus !== 'APPROVED') {
      throw new ForbiddenException('Cadastro de motoboy ainda não aprovado.');
    }
    if (driver.accountStatus !== 'ACTIVE') {
      throw new ForbiddenException('Conta de motoboy suspensa ou bloqueada. Contate o suporte.');
    }
    return driver;
  }
}
