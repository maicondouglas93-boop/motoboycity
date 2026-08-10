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
    return driver;
  }
}
