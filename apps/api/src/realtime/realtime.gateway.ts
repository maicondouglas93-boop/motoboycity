import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway } from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { getAllowedOrigins } from '../common/cors';

/**
 * Infraestrutura Socket.IO preparada para uso futuro.
 * Nenhum evento de negócio é emitido/escutado nesta fase — ver Fase 1.
 */
@WebSocketGateway({ cors: { origin: getAllowedOrigins() } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  handleConnection(client: Socket): void {
    this.logger.debug(`Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Cliente desconectado: ${client.id}`);
  }
}
