import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { buildRedisConnectionOptions } from '../common/redis-connection';

/**
 * Conexão do BullMQ com o Redis.
 *
 * A configuração vem de `buildRedisConnectionOptions()`, a mesma usada por
 * `LiveDriverPresenceService`, para que fila e presença nunca apontem para
 * Redis diferentes nem divirjam em autenticação/TLS (portão P0.4).
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: {
          ...buildRedisConnectionOptions(),
          maxRetriesPerRequest: null,
        },
      }),
    }),
  ],
})
export class QueueModule {}
