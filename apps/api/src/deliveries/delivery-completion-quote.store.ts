import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type Redis from 'ioredis';
import { z } from 'zod';

export const DELIVERY_QUOTE_REDIS = Symbol('DELIVERY_QUOTE_REDIS');

/**
 * Quanto tempo o valor mostrado ao motoboy continua valendo.
 *
 * Cobre o intervalo real entre abrir o modal na porta do cliente e tocar em
 * confirmar — incluindo esperar o cliente descer. Depois disso a confirmação
 * recalcula, que é o comportamento de antes deste guarda-valor: nada trava.
 */
const QUOTE_TTL_SECONDS = 20 * 60;
const KEY_PREFIX = 'motoboycity:completion-quote:';

const reservedQuoteSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  distanceKm: z.number(),
  totalValue: z.number(),
  driverValue: z.number(),
  platformValue: z.number(),
  returnValue: z.number(),
  surchargeLabel: z.string().nullable(),
  surchargeValue: z.number(),
});

export type ReservedCompletionQuote = z.infer<typeof reservedQuoteSchema>;

/**
 * O valor que o motoboy LEU antes de confirmar uma entrega sem endereço.
 *
 * Por que guardar, em vez de recalcular na confirmação: o preço depende da
 * taxa adicional vigente, e ela liga e desliga sozinha (faixa de horário,
 * modo chuva). Recalculando, uma virada entre o motoboy ler e tocar faria ele
 * ver um valor e receber outro — exatamente a desconfiança que mostrar o valor
 * antes existe para evitar.
 *
 * A amarração é ao PONTO EXATO. O aplicativo congela o fix quando o modal abre
 * e manda esse mesmo fix na confirmação; qualquer outro ponto não bate e a
 * confirmação calcula de novo. Por isso o cliente não consegue escolher preço:
 * o valor é do servidor, e o ponto é o mesmo que ele já mandaria de qualquer
 * jeito para virar destino.
 *
 * Nada aqui pode travar uma entrega. Redis fora, valor expirado ou corrompido:
 * tudo vira "não achei", e a confirmação segue pelo cálculo normal.
 */
@Injectable()
export class DeliveryCompletionQuoteStore implements OnModuleDestroy {
  private readonly logger = new Logger(DeliveryCompletionQuoteStore.name);

  constructor(@Inject(DELIVERY_QUOTE_REDIS) private readonly redis: Redis) {}

  async reserve(deliveryId: string, quote: ReservedCompletionQuote): Promise<void> {
    try {
      await this.redis.set(
        `${KEY_PREFIX}${deliveryId}`,
        JSON.stringify(quote),
        'EX',
        QUOTE_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.warn(
        `Nao foi possivel reservar o valor da entrega ${deliveryId}: ${String(error)}`,
      );
    }
  }

  /**
   * O valor reservado para ESTE ponto, ou `null`.
   *
   * Comparação exata de propósito: é o mesmo número que o aplicativo mandou
   * no preview, ida e volta por JSON, que preserva o double. Tolerância aqui
   * deixaria um ponto vizinho herdar o preço de outro.
   */
  async find(
    deliveryId: string,
    lat: number,
    lng: number,
  ): Promise<ReservedCompletionQuote | null> {
    try {
      const raw = await this.redis.get(`${KEY_PREFIX}${deliveryId}`);
      if (!raw) return null;
      const quote = reservedQuoteSchema.parse(JSON.parse(raw) as unknown);
      return quote.lat === lat && quote.lng === lng ? quote : null;
    } catch (error) {
      this.logger.warn(`Valor reservado da entrega ${deliveryId} ilegivel: ${String(error)}`);
      return null;
    }
  }

  /** Depois da entrega fechada a reserva não serve para nada; sai da memória. */
  async discard(deliveryId: string): Promise<void> {
    try {
      await this.redis.del(`${KEY_PREFIX}${deliveryId}`);
    } catch {
      // Expira sozinha. Limpar é cortesia, não obrigação.
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
