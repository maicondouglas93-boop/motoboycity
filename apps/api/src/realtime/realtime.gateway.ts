import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { OperationalActivityEvent, PublicDeliveryTrackingLocation } from '@motoboycity/types';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { getAllowedOrigins } from '../common/cors';
import type { JwtPayload } from '../auth/jwt.strategy';
import { credentialFingerprint } from '../auth/credential-fingerprint';
import {
  hasPublicLiveLocation,
  isPublicTrackingActive,
  toPublicTrackingStatus,
} from '../common/public-tracking-status';
import { PublicTrackingTokenService } from '../common/public-tracking-token.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Autentica a conexão pelo mesmo JWT da API REST (claim "sub" = userId).
 * ADMIN entra na sala "admin" (feed de atividade); DRIVER entra numa sala
 * própria (driver:{driverId}) pra receber ofertas de despacho endereçadas
 * só a ele. COMPANY_MEMBER entra na sala de cada empresa ativa à qual
 * pertence, inclusive para receber atualizações de localização dos seus pedidos.
 */
@Injectable()
@WebSocketGateway({ cors: { origin: getAllowedOrigins() } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly socketDriverId = new Map<string, string>();
  private readonly socketUserId = new Map<string, string>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly publicTrackingTokens: PublicTrackingTokenService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const publicTrackingToken = this.extractPublicTrackingToken(client);
    if (publicTrackingToken) {
      await this.handlePublicTrackingConnection(client, publicTrackingToken);
      return;
    }

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

    // Registra antes da consulta para o reset de senha conseguir encerrar tambem
    // um handshake que esteja em andamento. Sem isso, havia uma janela entre a
    // leitura do hash antigo e a inclusao no mapa de sockets.
    this.socketUserId.set(client.id, payload.sub);
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      this.disconnectClient(client);
      return;
    }
    if (this.isDisconnected(client)) {
      this.forgetSocket(client.id);
      return;
    }
    if (payload.credentialVersion !== credentialFingerprint(user.passwordHash)) {
      this.disconnectClient(client);
      return;
    }

    if (user.type === 'ADMIN') {
      void client.join('admin');
      this.logger.debug(`Admin conectado: ${client.id}`);
      return;
    }

    if (user.type === 'DRIVER') {
      const driver = await this.prisma.driver.findUnique({ where: { userId: user.id } });
      if (this.isDisconnected(client)) {
        this.forgetSocket(client.id);
        return;
      }
      if (!driver) {
        this.disconnectClient(client);
        return;
      }
      this.socketDriverId.set(client.id, driver.id);
      void client.join(this.driverRoom(driver.id));
      this.logger.debug(`Motoboy conectado: ${client.id} (driver ${driver.id})`);
      return;
    }

    if (user.type === 'COMPANY_MEMBER') {
      const memberships = await this.prisma.companyTeamMember.findMany({
        where: { userId: user.id, active: true },
        select: { companyId: true },
      });
      if (this.isDisconnected(client)) {
        this.forgetSocket(client.id);
        return;
      }
      if (memberships.length === 0) {
        this.disconnectClient(client);
        return;
      }
      await Promise.all(
        memberships.map((membership) => client.join(this.companyRoom(membership.companyId))),
      );
      this.logger.debug(`Membro de empresa conectado: ${client.id}`);
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const driverId = this.socketDriverId.get(client.id);
    this.forgetSocket(client.id);
    if (!driverId) {
      return;
    }

    this.logger.debug(`Motoboy desconectado: ${client.id} (driver ${driverId})`);
  }

  emitToDriver(driverId: string, event: string, payload: unknown): void {
    this.server.to(this.driverRoom(driverId)).emit(event, payload);
  }

  /** Encerra conexoes que ainda carregam uma credencial anterior do usuario. */
  disconnectUser(userId: string): number {
    const socketIds = [...this.socketUserId.entries()]
      .filter(([, connectedUserId]) => connectedUserId === userId)
      .map(([socketId]) => socketId);

    for (const socketId of socketIds) {
      this.socketUserId.delete(socketId);
      this.socketDriverId.delete(socketId);
      this.server.sockets.sockets.get(socketId)?.disconnect(true);
    }
    return socketIds.length;
  }

  private disconnectClient(client: Socket): void {
    this.forgetSocket(client.id);
    client.disconnect(true);
  }

  private forgetSocket(socketId: string): void {
    this.socketDriverId.delete(socketId);
    this.socketUserId.delete(socketId);
  }

  private isDisconnected(client: Socket): boolean {
    return client.connected === false;
  }

  emitAdminActivity(
    input: string | Omit<OperationalActivityEvent, 'id' | 'at'>,
  ): OperationalActivityEvent {
    const event: OperationalActivityEvent = {
      id: randomUUID(),
      at: new Date().toISOString(),
      ...(typeof input === 'string' ? { type: 'GENERIC', message: input } : input),
    };
    this.server.to('admin').emit('admin:activity', event);
    return event;
  }

  emitDeliveryUpdated(companyId: string, payload: unknown): void {
    this.server.to('admin').emit('delivery:updated', payload);
    this.server.to(this.companyRoom(companyId)).emit('delivery:updated', payload);
    const deliveryId = this.deliveryIdFromPayload(payload);
    if (deliveryId) {
      void this.emitPublicDeliveryUpdated(deliveryId).catch((error: unknown) =>
        this.logger.warn(
          `Falha ao publicar status do rastreamento publico ${deliveryId}: ${String(error)}`,
        ),
      );
    }
  }

  emitDriverLocation(payload: unknown): void {
    this.server.to('admin').emit('driver:location', payload);
  }

  emitDriverPresence(payload: unknown): void {
    this.server.to('admin').emit('driver:presence', payload);
  }

  emitDispatchQueueUpdated(payload: unknown): void {
    this.server.to('admin').emit('dispatch:queue-updated', payload);
  }

  emitDeliveryLocation(companyId: string, payload: unknown): void {
    this.server.to('admin').emit('delivery:location', payload);
    this.server.to(this.companyRoom(companyId)).emit('delivery:location', payload);
  }

  async emitPublicDeliveryLocation(
    deliveryId: string,
    location: PublicDeliveryTrackingLocation,
  ): Promise<void> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: { status: true, publicTrackingTokenId: true, publicTrackingIssuedAt: true },
    });
    if (
      !delivery?.publicTrackingTokenId ||
      !delivery.publicTrackingIssuedAt ||
      !hasPublicLiveLocation(delivery.status)
    ) {
      return;
    }
    this.server.to(this.publicTrackingRoom(deliveryId)).emit('public-tracking:location', location);
  }

  private driverRoom(driverId: string): string {
    return `driver:${driverId}`;
  }

  private companyRoom(companyId: string): string {
    return `company:${companyId}`;
  }

  private publicTrackingRoom(deliveryId: string): string {
    return `public-tracking:${deliveryId}`;
  }

  private async handlePublicTrackingConnection(client: Socket, token: string): Promise<void> {
    const tokenId = this.publicTrackingTokens.identifierFromToken(token);
    if (!tokenId) {
      client.disconnect(true);
      return;
    }
    const delivery = await this.prisma.delivery.findUnique({
      where: { publicTrackingTokenId: tokenId },
      select: { id: true, status: true, publicTrackingIssuedAt: true },
    });
    if (
      !delivery?.publicTrackingIssuedAt ||
      !isPublicTrackingActive(delivery.status) ||
      this.isDisconnected(client)
    ) {
      client.disconnect(true);
      return;
    }
    await client.join(this.publicTrackingRoom(delivery.id));
    this.logger.debug(`Rastreamento publico conectado: ${client.id}`);
  }

  private async emitPublicDeliveryUpdated(deliveryId: string): Promise<void> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: {
        status: true,
        statusChangedAt: true,
        publicTrackingTokenId: true,
        publicTrackingIssuedAt: true,
      },
    });
    if (!delivery?.publicTrackingTokenId || !delivery.publicTrackingIssuedAt) return;

    this.server.to(this.publicTrackingRoom(deliveryId)).emit('public-tracking:updated', {
      status: toPublicTrackingStatus(delivery.status),
      updatedAt: delivery.statusChangedAt.toISOString(),
      location: null,
    });

    if (!isPublicTrackingActive(delivery.status)) {
      await this.prisma.delivery.updateMany({
        where: {
          id: deliveryId,
          publicTrackingTokenId: delivery.publicTrackingTokenId,
          publicTrackingIssuedAt: delivery.publicTrackingIssuedAt,
        },
        data: { publicTrackingIssuedAt: null },
      });
    }
  }

  private deliveryIdFromPayload(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    const value = record['deliveryId'] ?? record['id'];
    return typeof value === 'string' && value ? value : null;
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

  private extractPublicTrackingToken(client: Socket): string | null {
    const value = client.handshake.auth?.['publicTrackingToken'];
    return typeof value === 'string' && value ? value : null;
  }
}
