import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Deixa a conexão do BullMQ com o Redis pré-configurada para uso futuro.
 * Nenhuma fila (queue) de negócio é registrada nesta fase — ver Fase 1.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          maxRetriesPerRequest: null,
        },
      }),
    }),
  ],
})
export class QueueModule {}
