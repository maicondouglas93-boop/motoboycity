import { z } from 'zod';

/** Referência verificada no geocoding Open-Meteo: Lajinha, Minas Gerais, BR. */
export const LAJINHA = { latitude: -20.15139, longitude: -41.62278 } as const;
export const RAIN_POLL_MS = 5 * 60_000;
export const RAIN_DRY_DELAY_MS = 30 * 60_000;
export const RAIN_MAX_AGE_MS = 30 * 60_000;

const rainyCodes = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const weatherCodes = [0, 1, 2, 3, 45, 48, ...rainyCodes, 71, 73, 75, 77, 85, 86];
const weatherCode = z
  .number()
  .int()
  .refine((code) => weatherCodes.includes(code));

const currentWeatherSchema = z.object({
  latitude: z.number().refine((value) => Math.abs(value - LAJINHA.latitude) < 0.25),
  longitude: z.number().refine((value) => Math.abs(value - LAJINHA.longitude) < 0.25),
  current_units: z.object({
    time: z.literal('unixtime'),
    rain: z.literal('mm'),
    showers: z.literal('mm'),
  }),
  current: z.object({
    time: z.number().int().positive(),
    rain: z.number().nonnegative().max(1000),
    showers: z.number().nonnegative().max(1000),
    weather_code: weatherCode,
  }),
});

const timestamp = z.number().int().positive().max(8_640_000_000_000_000);
export const rainStateSchema = z
  .object({
    observedAt: timestamp,
    checkedAt: timestamp,
    raining: z.boolean(),
    rainMm: z.number().nonnegative().max(2000),
    weatherCode,
    activeSince: timestamp.nullable(),
    drySince: timestamp.nullable(),
  })
  .refine(
    (state) =>
      state.observedAt <= state.checkedAt &&
      (state.activeSince === null || state.activeSince <= state.checkedAt) &&
      (state.drySince === null || state.drySince <= state.checkedAt) &&
      (state.raining
        ? state.drySince === null && state.activeSince !== null
        : state.drySince !== null) &&
      state.raining === (state.rainMm > 0 || rainyCodes.has(state.weatherCode)),
  );
export type RainState = z.infer<typeof rainStateSchema>;

export function isRainFresh(state: RainState, now: number): boolean {
  return (
    state.observedAt <= now && state.checkedAt <= now && now - state.observedAt < RAIN_MAX_AGE_MS
  );
}

export function isAutomaticRainActive(state: RainState, at: number, now: number): boolean {
  return (
    isRainFresh(state, now) &&
    state.activeSince !== null &&
    at >= state.activeSince &&
    at <= now &&
    (state.drySince === null || at < state.drySince + RAIN_DRY_DELAY_MS)
  );
}

/** Não usa previsão futura, probabilidade, horário do navegador nem uma resposta antiga como nova. */
export function advanceRainState(
  payload: unknown,
  previous: RainState | null,
  now: number,
): RainState {
  const { current } = currentWeatherSchema.parse(payload);
  const observedAt = current.time * 1000;
  if (observedAt > now || now - observedAt >= RAIN_MAX_AGE_MS) {
    throw new Error('Clima fora da janela atual.');
  }
  if (previous && observedAt < previous.observedAt) {
    throw new Error('Clima fora de ordem.');
  }
  const rainMm = current.rain + current.showers;
  const raining = rainMm > 0 || rainyCodes.has(current.weather_code);
  const wasActive = previous !== null && isAutomaticRainActive(previous, now, now);
  return {
    observedAt,
    checkedAt: now,
    raining,
    rainMm,
    weatherCode: current.weather_code,
    // A primeira detecção só vale daqui para frente, não para pedidos anteriores.
    activeSince: raining
      ? wasActive
        ? previous!.activeSince
        : now
      : wasActive
        ? previous!.activeSince
        : null,
    drySince: raining
      ? null
      : ((previous && isRainFresh(previous, now) ? previous.drySince : null) ?? now),
  };
}
