import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { buildRedisConnectionOptions } from '../common/redis-connection';

/**
 * Conexão do BullMQ com o Redis.
 *
 * A configuração vem de `buildRedisConnectionOptions()`, a mesma usada por
 * `LiveDriverPresenceService`, para que fila e presença nunca apontem para
 * Redis diferentes nem divirjam em autenticação/TLS (portão P0.4).
 *
 * Retenção de jobs: sem ela o BullMQ guarda PARA SEMPRE todo job concluído ou
 * falho. As varreduras de minuto em minuto (despacho, loja, presença) e uma
 * expiração por oferta encheram os 256 MB do Redis de produção em dois meses;
 * com a política `noeviction`, o Redis cheio recusa toda gravação, e nenhum
 * motoboy conseguia ficar Ativo (503 em `PUT /driver/presence`, 19/10/2026).
 * Vale também para os agendadores: `upsertJobScheduler` herda estas opções.
 *
 * Só por idade, nunca por quantidade: o corte por `count` do BullMQ apaga todo
 * o excedente num único script Lua, sem limite. Com histórico acumulado, isso
 * travou o Redis (`BUSY`) por ~30 s no deploy de 19/10. O corte por `age` apaga
 * no máximo 1000 jobs por conclusão, e o resto sai aos poucos.
 */
export const RETENCAO_DE_JOBS = {
  /** Concluído só serve para depurar o dia: até 24 h. */
  removeOnComplete: { age: 24 * 60 * 60 },
  /** Falho fica mais, para dar tempo de investigar: até 7 dias. */
  removeOnFail: { age: 7 * 24 * 60 * 60 },
} as const;

@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: {
          ...buildRedisConnectionOptions(),
          maxRetriesPerRequest: null,
        },
        defaultJobOptions: RETENCAO_DE_JOBS,
      }),
    }),
  ],
})
export class QueueModule {}
