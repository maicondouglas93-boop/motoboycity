import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import { credentialFingerprint } from '../auth/credential-fingerprint';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from './realtime.gateway';

interface MockSocket {
  id: string;
  connected: boolean;
  handshake: { auth: Record<string, string>; headers: Record<string, string> };
  disconnect: jest.Mock;
  join: jest.Mock;
}

const passwordHash = 'bcrypt-hash-only-for-token-version-test';

function validPayload(sub: string) {
  return { sub, credentialVersion: credentialFingerprint(passwordHash) };
}

function mockUser(id: string, type: 'ADMIN' | 'DRIVER' | 'COMPANY_MEMBER') {
  return { id, type, passwordHash };
}

function mockSocket(
  id: string,
  options: { token?: string; authHeader?: string } = {},
): MockSocket & Socket {
  const socket = {
    id,
    connected: true,
    handshake: {
      auth: options.token ? { token: options.token } : {},
      headers: options.authHeader ? { authorization: options.authHeader } : {},
    },
    disconnect: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
  } as unknown as MockSocket & Socket;
  socket.disconnect.mockImplementation(() => {
    socket.connected = false;
    return socket;
  });
  return socket;
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
  let serverSocketGet: jest.Mock;

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
    serverSocketGet = jest.fn();
    (gateway as unknown as { server: unknown }).server = {
      to: serverTo,
      sockets: { sockets: { get: serverSocketGet } },
    };
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
      jwtService.verifyAsync.mockResolvedValue(validPayload('user-1'));
      prisma.user.findUnique.mockResolvedValue(null);
      const socket = mockSocket('s1', { token: 'tok' });

      await gateway.handleConnection(socket);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('admin entra na sala "admin"', async () => {
      jwtService.verifyAsync.mockResolvedValue(validPayload('user-admin'));
      prisma.user.findUnique.mockResolvedValue(mockUser('user-admin', 'ADMIN'));
      const socket = mockSocket('s1', { token: 'tok' });

      await gateway.handleConnection(socket);

      expect(socket.join).toHaveBeenCalledWith('admin');
      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it('motoboy sem registro de Driver é desconectado mesmo com token válido', async () => {
      jwtService.verifyAsync.mockResolvedValue(validPayload('user-driver'));
      prisma.user.findUnique.mockResolvedValue(mockUser('user-driver', 'DRIVER'));
      prisma.driver.findUnique.mockResolvedValue(null);
      const socket = mockSocket('s1', { token: 'tok' });

      await gateway.handleConnection(socket);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('motoboy entra na sala driver:{id}', async () => {
      jwtService.verifyAsync.mockResolvedValue(validPayload('user-driver'));
      prisma.user.findUnique.mockResolvedValue(mockUser('user-driver', 'DRIVER'));
      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', userId: 'user-driver' });
      const socket = mockSocket('s1', { token: 'tok' });

      await gateway.handleConnection(socket);

      expect(socket.join).toHaveBeenCalledWith('driver:driver-1');
      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it('aceita o token vindo do header Authorization também', async () => {
      jwtService.verifyAsync.mockResolvedValue(validPayload('user-admin'));
      prisma.user.findUnique.mockResolvedValue(mockUser('user-admin', 'ADMIN'));
      const socket = mockSocket('s1', { authHeader: 'Bearer header-token' });

      await gateway.handleConnection(socket);

      expect(jwtService.verifyAsync).toHaveBeenCalledWith('header-token');
      expect(socket.join).toHaveBeenCalledWith('admin');
    });

    it('desconecta token emitido para uma senha anterior', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-admin',
        credentialVersion: credentialFingerprint('hash-antigo'),
      });
      prisma.user.findUnique.mockResolvedValue(mockUser('user-admin', 'ADMIN'));
      const socket = mockSocket('s-old', { token: 'old-token' });

      await gateway.handleConnection(socket);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('encerra um handshake em andamento quando a senha muda', async () => {
      jwtService.verifyAsync.mockResolvedValue(validPayload('user-admin'));
      let resolveUser: ((user: ReturnType<typeof mockUser>) => void) | undefined;
      prisma.user.findUnique.mockReturnValue(
        new Promise((resolve) => {
          resolveUser = resolve;
        }),
      );
      const socket = mockSocket('s-race', { token: 'old-token' });
      serverSocketGet.mockReturnValue(socket);

      const connection = gateway.handleConnection(socket);
      await Promise.resolve();
      await Promise.resolve();

      expect(gateway.disconnectUser('user-admin')).toBe(1);
      resolveUser?.(mockUser('user-admin', 'ADMIN'));
      await connection;

      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.join).not.toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('não faz nada se o socket não era de um motoboy conectado', async () => {
      const socket = mockSocket('s-unknown');

      await gateway.handleDisconnect(socket);

      expect(prisma.driver.findUnique).not.toHaveBeenCalled();
    });

    it('não derruba a presença ao desconectar um socket isolado', async () => {
      jwtService.verifyAsync.mockResolvedValue(validPayload('user-driver'));
      prisma.user.findUnique.mockResolvedValue(mockUser('user-driver', 'DRIVER'));
      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', availability: 'AVAILABLE' });
      const socket = mockSocket('s1', { token: 'tok' });
      await gateway.handleConnection(socket);

      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', availability: 'AVAILABLE' });
      await gateway.handleDisconnect(socket);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(serverTo).not.toHaveBeenCalledWith('admin');
    });

    it('não consulta nem grava o banco quando outra sessão pode seguir válida', async () => {
      jwtService.verifyAsync.mockResolvedValue(validPayload('user-driver'));
      prisma.user.findUnique.mockResolvedValue(mockUser('user-driver', 'DRIVER'));
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

    it('disconnectUser encerra somente os sockets vinculados ao usuário', async () => {
      jwtService.verifyAsync.mockResolvedValue(validPayload('user-admin'));
      prisma.user.findUnique.mockResolvedValue(mockUser('user-admin', 'ADMIN'));
      const socket = mockSocket('s-admin', { token: 'tok' });
      await gateway.handleConnection(socket);
      serverSocketGet.mockReturnValue(socket);

      expect(gateway.disconnectUser('user-admin')).toBe(1);
      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(gateway.disconnectUser('outro-user')).toBe(0);
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
