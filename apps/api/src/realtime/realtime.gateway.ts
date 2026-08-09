import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { getAllowedOrigins } from '../common/cors';
import type { JwtPayload } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Autentica a conexão pelo mesmo JWT da API REST (claim "sub" = userId).
 * ADMIN entra na sala "admin" (feed de atividade); DRIVER entra numa sala
 * própria (driver:{driverId}) pra receber ofertas de despacho endereçadas
 * só a ele. COMPANY_MEMBER não tem sala nesta fase — nenhum evento é
 * direcionado a empresa ainda.
 */
@Injectable()
@WebSocketGateway({ cors: { origin: getAllowedOrigins() } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly socketDriverId = new Map<string, string>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      client.disconnect(true);
      return;
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      client.disconnect(true);
      return;
    }

    if (user.type === 'ADMIN') {
      void client.join('admin');
      this.logger.debug(`Admin conectado: ${client.id}`);
      return;
    }

    if (user.type === 'DRIVER') {
      const driver = await this.prisma.driver.findUnique({ where: { userId: user.id } });
      if (!driver) {
        client.disconnect(true);
        return;
      }
      this.socketDriverId.set(client.id, driver.id);
      void client.join(this.driverRoom(driver.id));
      this.logger.debug(`Motoboy conectado: ${client.id} (driver ${driver.id})`);
      return;
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const driverId = this.socketDriverId.get(client.id);
    this.socketDriverId.delete(client.id);
    if (!driverId) {
      return;
    }

    this.logger.debug(`Motoboy desconectado: ${client.id} (driver ${driverId})`);
    await this.markDriverOfflineOnDisconnect(driverId);
  }

  emitToDriver(driverId: string, event: string, payload: unknown): void {
    this.server.to(this.driverRoom(driverId)).emit(event, payload);
  }

  emitAdminActivity(message: string): void {
    this.server.to('admin').emit('admin:activity', { message, at: new Date().toISOString() });
  }

  private driverRoom(driverId: string): string {
    return `driver:${driverId}`;
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.['token'] as string | undefined;
    if (authToken) {
      return authToken;
    }

    const header = client.handshake.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      return header.slice('Bearer '.length);
    }

    return null;
  }

  /**
   * Duplica de propósito uma fatia pequena da lógica de presença — este
   * módulo não pode importar DriverPresenceModule (que já importa este
   * módulo pros eventos de presença); fechar o ciclo aqui com Prisma direto
   * é mais simples do que forwardRef().
   */
  private async markDriverOfflineOnDisconnect(driverId: string): Promise<void> {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver || driver.availability !== 'AVAILABLE') {
      return;
    }

    await this.prisma.$transaction([
      this.prisma.driver.update({
        where: { id: driverId },
        data: { availability: 'UNAVAILABLE' },
      }),
      this.prisma.driverPresenceLog.updateMany({
        where: { driverId, wentOfflineAt: null },
        data: { wentOfflineAt: new Date() },
      }),
    ]);
    this.emitAdminActivity(`Um motoboy ficou offline (conexão perdida).`);
  }
}
