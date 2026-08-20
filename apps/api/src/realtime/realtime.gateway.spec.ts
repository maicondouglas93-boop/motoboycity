import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from './realtime.gateway';

interface MockSocket {
  id: string;
  handshake: { auth: Record<string, string>; headers: Record<string, string> };
  disconnect: jest.Mock;
  join: jest.Mock;
}

function mockSocket(id: string, options: { token?: string; authHeader?: string } = {}): MockSocket & Socket {
  return {
    id,
    handshake: {
      auth: options.token ? { token: options.token } : {},
      headers: options.authHeader ? { authorization: options.authHeader } : {},
    },
    disconnect: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
  } as unknown as MockSocket & Socket;
}

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  let jwtService: { verifyAsync: jest.Mock };
  let prisma: {
    user: { findUnique: jest.Mock };
    driver: { findUnique: jest.Mock; update: jest.Mock };
    driverPresenceLog: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let serverEmit: jest.Mock;
  let serverTo: jest.Mock;

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn() };
    prisma = {
      user: { findUnique: jest.fn() },
      driver: { findUnique: jest.fn(), update: jest.fn() },
      driverPresenceLog: { updateMany: jest.fn() },
      $transaction: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeGateway,
        { provide: JwtService, useValue: jwtService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    gateway = module.get(RealtimeGateway);

    serverEmit = jest.fn();
    serverTo = jest.fn().mockReturnValue({ emit: serverEmit });
    (gateway as unknown as { server: unknown }).server = { to: serverTo };
  });

  describe('handleConnection', () => {
    it('desconecta quando não há token', async () => {
      const socket = mockSocket('s1');

      await gateway.handleConnection(socket);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('desconecta quando o token é inválido', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid'));
      const socket = mockSocket('s1', { token: 'bad-token' });

      await gateway.handleConnection(socket);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('desconecta quando o usuário do token não existe mais', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      prisma.user.findUnique.mockResolvedValue(null);
      const socket = mockSocket('s1', { token: 'tok' });

      await gateway.handleConnection(socket);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('admin entra na sala "admin"', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-admin' });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-admin', type: 'ADMIN' });
      const socket = mockSocket('s1', { token: 'tok' });

      await gateway.handleConnection(socket);

      expect(socket.join).toHaveBeenCalledWith('admin');
      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it('motoboy sem registro de Driver é desconectado mesmo com token válido', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-driver' });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-driver', type: 'DRIVER' });
      prisma.driver.findUnique.mockResolvedValue(null);
      const socket = mockSocket('s1', { token: 'tok' });

      await gateway.handleConnection(socket);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('motoboy entra na sala driver:{id}', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-driver' });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-driver', type: 'DRIVER' });
      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', userId: 'user-driver' });
      const socket = mockSocket('s1', { token: 'tok' });

      await gateway.handleConnection(socket);

      expect(socket.join).toHaveBeenCalledWith('driver:driver-1');
      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it('aceita o token vindo do header Authorization também', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-admin' });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-admin', type: 'ADMIN' });
      const socket = mockSocket('s1', { authHeader: 'Bearer header-token' });

      await gateway.handleConnection(socket);

      expect(jwtService.verifyAsync).toHaveBeenCalledWith('header-token');
      expect(socket.join).toHaveBeenCalledWith('admin');
    });
  });

  describe('handleDisconnect', () => {
    it('não faz nada se o socket não era de um motoboy conectado', async () => {
      const socket = mockSocket('s-unknown');

      await gateway.handleDisconnect(socket);

      expect(prisma.driver.findUnique).not.toHaveBeenCalled();
    });

    it('não derruba a presença ao desconectar um socket isolado', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-driver' });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-driver', type: 'DRIVER' });
      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', availability: 'AVAILABLE' });
      const socket = mockSocket('s1', { token: 'tok' });
      await gateway.handleConnection(socket);

      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', availability: 'AVAILABLE' });
      await gateway.handleDisconnect(socket);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(serverTo).not.toHaveBeenCalledWith('admin');
    });

    it('não consulta nem grava o banco quando outra sessão pode seguir válida', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-driver' });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-driver', type: 'DRIVER' });
      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', availability: 'AVAILABLE' });
      const socket = mockSocket('s1', { token: 'tok' });
      await gateway.handleConnection(socket);

      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', availability: 'UNAVAILABLE' });
      await gateway.handleDisconnect(socket);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.driver.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  describe('emitToDriver / emitAdminActivity', () => {
    it('emitToDriver manda pra sala driver:{id}', () => {
      gateway.emitToDriver('driver-1', 'delivery:offer', { foo: 'bar' });

      expect(serverTo).toHaveBeenCalledWith('driver:driver-1');
      expect(serverEmit).toHaveBeenCalledWith('delivery:offer', { foo: 'bar' });
    });

    it('emitAdminActivity manda pra sala admin com mensagem e timestamp', () => {
      gateway.emitAdminActivity('Pedido #1 criado');

      expect(serverTo).toHaveBeenCalledWith('admin');
      expect(serverEmit).toHaveBeenCalledWith(
        'admin:activity',
        expect.objectContaining({ message: 'Pedido #1 criado', at: expect.any(String) }),
      );
    });
  });
});
