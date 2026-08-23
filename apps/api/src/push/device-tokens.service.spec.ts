import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DeviceTokensService } from './device-tokens.service';

const motoboy = { id: 'user-1', type: 'DRIVER' } as User;

describe('DeviceTokensService', () => {
  let service: DeviceTokensService;
  let prisma: {
    driver: { findUnique: jest.Mock };
    deviceToken: { upsert: jest.Mock; deleteMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      driver: { findUnique: jest.fn().mockResolvedValue({ id: 'driver-1' }) },
      deviceToken: { upsert: jest.fn(), deleteMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DeviceTokensService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(DeviceTokensService);
  });

  describe('register', () => {
    it('reatribui o aparelho quando ele troca de dono', async () => {
      /**
       * E o caso que importa: o motoboy sai da conta e outro entra no MESMO
       * celular. Sem o upsert pela chave unica do token, o aparelho ficaria
       * registrado nas duas contas — a oferta de um tocaria no celular do
       * outro, e a notificacao mostraria pedido que nao e dele.
       */
      await service.register(motoboy, { token: 'abc1234567', platform: 'ANDROID' });

      const chamada = prisma.deviceToken.upsert.mock.calls[0]?.[0];
      expect(chamada.where).toEqual({ token: 'abc1234567' });
      expect(chamada.update.driverId).toBe('driver-1');
      expect(chamada.create.driverId).toBe('driver-1');
    });

    it('atualiza o carimbo de visto por último ao reregistrar', async () => {
      // O FCM so avisa que um token morreu na hora de enviar; sem este carimbo,
      // aparelho que sumiu sem desinstalar ficaria aqui para sempre.
      await service.register(motoboy, {
        token: 'abc1234567',
        platform: 'ANDROID',
        appVersion: '1.2.3',
      });

      const chamada = prisma.deviceToken.upsert.mock.calls[0]?.[0];
      expect(chamada.update.lastSeenAt).toBeInstanceOf(Date);
      expect(chamada.update.appVersion).toBe('1.2.3');
    });

    it('recusa quem não é motoboy', async () => {
      await expect(
        service.register({ id: 'user-2', type: 'ADMIN' } as User, {
          token: 'abc1234567',
          platform: 'ANDROID',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('unregister', () => {
    it('apaga só o aparelho do próprio dono', async () => {
      // Sem a segunda condicao, alguem com um token qualquer conseguiria
      // desregistrar o aparelho de outro motoboy e calar as ofertas dele.
      await service.unregister(motoboy, 'abc1234567');

      expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({
        where: { token: 'abc1234567', driverId: 'driver-1' },
      });
    });
  });
});
