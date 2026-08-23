import { ForbiddenException, Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { RegisterDeviceTokenPayload } from '@motoboycity/validation';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DeviceTokensService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra o aparelho do motoboy, ou o reatribui se ele já era de outro.
   *
   * O `upsert` pela chave única do token é o que resolve a troca de dono: o
   * motoboy sai da conta, outro entra no mesmo celular, e o registro migra em
   * vez de duplicar. Sem isso, a oferta de um tocaria no celular do outro — e
   * pior, o antigo dono conseguiria ver pedido que não é dele na notificação.
   */
  async register(user: User, payload: RegisterDeviceTokenPayload): Promise<{ ok: true }> {
    const driver = await this.findDriverForUser(user);

    await this.prisma.deviceToken.upsert({
      where: { token: payload.token },
      create: {
        driverId: driver.id,
        token: payload.token,
        platform: payload.platform,
        appVersion: payload.appVersion ?? null,
      },
      update: {
        driverId: driver.id,
        platform: payload.platform,
        appVersion: payload.appVersion ?? null,
        lastSeenAt: new Date(),
      },
    });

    return { ok: true };
  }

  /**
   * Remove o aparelho. Chamado ao sair da conta.
   *
   * Apaga por token E dono: sem a segunda condição, alguém com um token
   * qualquer conseguiria desregistrar o aparelho de outro motoboy e calar as
   * ofertas dele.
   */
  async unregister(user: User, token: string): Promise<{ ok: true }> {
    const driver = await this.findDriverForUser(user);
    await this.prisma.deviceToken.deleteMany({ where: { token, driverId: driver.id } });
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
