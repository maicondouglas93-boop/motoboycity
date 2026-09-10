import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SurchargeRainAutomation } from '@motoboycity/types';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { buildRedisConnectionOptions } from '../common/redis-connection';
import {
  advanceRainState,
  isAutomaticRainActive,
  isRainFresh,
  LAJINHA,
  RAIN_POLL_MS,
  rainStateSchema,
  type RainState,
} from './rain-policy';

const STORE_STATE_IF_OWNER = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    redis.call('set', KEYS[2], ARGV[2], 'EX', 7200)
    return 1
  end
  return 0
`;

/** Consulta compartilhada entre instâncias; cotar/listar taxa lê somente a memória local. */
@Injectable()
export class RainWeatherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RainWeatherService.name);
  private readonly enabled: boolean;
  private readonly apiKey: string;
  private readonly surchargeId: string;
  private readonly configured: boolean;
  private redis: Redis | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private snapshot: RainState | null = null;
  private refreshing = false;
  private stopped = false;
  private failed = false;

  constructor(config: ConfigService) {
    this.enabled = config.get<string>('OPEN_METEO_RAIN_ENABLED') === 'true';
    this.apiKey = (config.get<string>('OPEN_METEO_API_KEY') ?? '').trim();
    this.surchargeId = (config.get<string>('OPEN_METEO_RAIN_SURCHARGE_ID') ?? '').trim();
    this.configured = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      this.surchargeId,
    );
  }

  onModuleInit(): void {
    if (!this.enabled || !this.configured) return;
    this.redis = new Redis({
      ...buildRedisConnectionOptions(),
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      commandTimeout: 3000,
    });
    this.redis.on('error', () => this.reportFailure());
    // Não aguarda clima/Redis para subir a API; nenhum erro daqui bloqueia pedidos.
    this.redis
      .connect()
      .then(() => this.refresh())
      .catch(() => this.reportFailure());
    this.timer = setInterval(() => {
      this.refresh().catch(() => this.reportFailure());
    }, 60_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.redis?.disconnect();
  }

  forSurcharge(id: string, at: Date = new Date()): SurchargeRainAutomation | null {
    if (id !== this.surchargeId) return null;
    const now = Date.now();
    const fresh = this.snapshot !== null && isRainFresh(this.snapshot, now);
    const activeNow =
      this.enabled &&
      this.configured &&
      this.snapshot !== null &&
      isAutomaticRainActive(this.snapshot, at.getTime(), now);
    const status: SurchargeRainAutomation['status'] = !this.enabled
      ? 'DISABLED'
      : !this.configured
        ? 'NOT_CONFIGURED'
        : !fresh
          ? 'UNAVAILABLE'
          : this.snapshot!.raining
            ? 'RAINING'
            : activeNow
              ? 'DRYING'
              : 'DRY';
    return {
      reference: 'Lajinha–MG',
      accessMode: this.apiKey ? 'COMMERCIAL' : 'PUBLIC',
      status,
      activeNow,
      observedAt: this.snapshot ? new Date(this.snapshot.observedAt).toISOString() : null,
      checkedAt: this.snapshot ? new Date(this.snapshot.checkedAt).toISOString() : null,
      drySince: this.snapshot?.drySince ? new Date(this.snapshot.drySince).toISOString() : null,
      rainMm: fresh ? this.snapshot!.rainMm : null,
    };
  }

  async refresh(): Promise<void> {
    if (!this.redis || this.stopped || this.refreshing || !this.enabled || !this.configured) return;
    this.refreshing = true;
    const stateKey = `motoboycity:rain:lajinha:v1:${this.surchargeId}`;
    const lockKey = `${stateKey}:poll`;
    try {
      const cached = await this.redis.get(stateKey);
      if (cached) {
        try {
          const parsed = rainStateSchema.safeParse(JSON.parse(cached));
          if (!parsed.success || parsed.data.checkedAt > Date.now())
            throw new Error('Cache climático inválido.');
          if (!this.snapshot || parsed.data.checkedAt >= this.snapshot.checkedAt)
            this.snapshot = parsed.data;
        } catch {
          // Cache inválido não é chuva, mas também não impede buscar uma amostra nova.
          this.reportFailure();
        }
      }
      const owner = randomUUID();
      // O TTL limita também retries com falha a uma consulta a cada cinco minutos.
      const lock = await this.redis.set(lockKey, owner, 'PX', RAIN_POLL_MS, 'NX');
      if (lock !== 'OK') return;
      const url = new URL(
        this.apiKey
          ? 'https://customer-api.open-meteo.com/v1/forecast'
          : 'https://api.open-meteo.com/v1/forecast',
      );
      url.search = new URLSearchParams({
        latitude: String(LAJINHA.latitude),
        longitude: String(LAJINHA.longitude),
        current: 'rain,showers,weather_code',
        timeformat: 'unixtime',
        precipitation_unit: 'mm',
        timezone: 'America/Sao_Paulo',
        forecast_days: '1',
        ...(this.apiKey ? { apikey: this.apiKey } : {}),
      }).toString();
      const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'error' });
      if (!response.ok) throw new Error('Consulta climática recusada.');
      const body = await response.text();
      if (body.length > 64_000) throw new Error('Resposta climática inválida.');
      const next = advanceRainState(JSON.parse(body) as unknown, this.snapshot, Date.now());
      if (this.stopped) return;
      // Uma resposta atrasada não pode sobrescrever a de outro processo após perder o lock.
      const stored = await this.redis.eval(
        STORE_STATE_IF_OWNER,
        2,
        lockKey,
        stateKey,
        owner,
        JSON.stringify(next),
      );
      if (stored !== 1) return;
      const wasActive =
        this.snapshot !== null &&
        isAutomaticRainActive(this.snapshot, this.snapshot.checkedAt, this.snapshot.checkedAt);
      this.snapshot = next;
      this.failed = false;
      const active = isAutomaticRainActive(next, Date.now(), Date.now());
      if (active !== wasActive) {
        this.logger.log(
          JSON.stringify({
            event: 'rain_automation_changed',
            surchargeId: this.surchargeId,
            reference: 'Lajinha-MG',
            active,
            observedAt: new Date(next.observedAt).toISOString(),
            rainMm: next.rainMm,
            weatherCode: next.weatherCode,
          }),
        );
      }
    } catch {
      // Não registra URL, resposta, exceção ou chave. Não interpreta falha como tempo seco.
      this.reportFailure();
    } finally {
      this.refreshing = false;
    }
  }

  private reportFailure(): void {
    if (this.stopped || this.failed) return;
    this.failed = true;
    this.logger.warn(
      'Clima indisponível; a taxa automática depende de dados recentes. Controle manual preservado.',
    );
  }
}
