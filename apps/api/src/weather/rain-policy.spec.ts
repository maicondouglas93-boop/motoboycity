import {
  advanceRainState,
  isAutomaticRainActive,
  LAJINHA,
  RAIN_MAX_AGE_MS,
  rainStateSchema,
} from './rain-policy';

const start = Date.parse('2026-09-10T15:00:00Z');
const minute = 60_000;
function weather(at = start, rain = 1, code = 61) {
  return {
    ...LAJINHA,
    current_units: { time: 'unixtime', rain: 'mm', showers: 'mm' },
    current: { time: at / 1000, interval: 900, rain, showers: 0, weather_code: code },
  };
}

describe('regra de chuva de Lajinha', () => {
  it('exige volume positivo e código compatível, incluindo garoa e pancadas', () => {
    for (const code of [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]) {
      const state = advanceRainState(weather(start, 0.1, code), null, start);
      expect(isAutomaticRainActive(state, start, start)).toBe(true);
      expect(rainStateSchema.safeParse(state).success).toBe(true);
    }
    const state = advanceRainState(
      { ...weather(), current: { ...weather().current, rain: 0, showers: 0.1, weather_code: 80 } },
      null,
      start,
    );
    expect(state.raining).toBe(true);
  });

  it('código de chuva/garoa/temporal sozinho não ativa com volume zero', () => {
    for (const code of [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]) {
      const state = advanceRainState(weather(start, 0, code), null, start);
      expect(state.raining).toBe(false);
      expect(isAutomaticRainActive(state, start, start)).toBe(false);
      expect(rainStateSchema.safeParse(state).success).toBe(true);
    }
  });

  it('acumulado positivo sozinho não ativa quando a condição atual não indica chuva', () => {
    for (const code of [0, 1, 2, 3, 45, 48, 71, 73, 75, 77, 85, 86]) {
      const state = advanceRainState(weather(start, 1, code), null, start);
      expect(state.raining).toBe(false);
      expect(isAutomaticRainActive(state, start, start)).toBe(false);
      expect(rainStateSchema.safeParse(state).success).toBe(true);
    }
  });

  it('não inventa intensidade mínima: garoa com volume positivo compatível continua elegível', () => {
    const state = advanceRainState(weather(start, 0.01, 51), null, start);
    expect(state.raining).toBe(true);
  });

  it('nuvem/neblina/probabilidade de chuva futura não ativam', () => {
    for (const code of [0, 1, 2, 3, 45, 48]) {
      const state = advanceRainState(
        { ...weather(start, 0, code), hourly: { precipitation_probability: [100] } },
        null,
        start,
      );
      expect(isAutomaticRainActive(state, start, start)).toBe(false);
    }
  });

  it('aguarda trinta minutos desde o primeiro dado seco, sem reiniciar por polling', () => {
    const wet = advanceRainState(weather(), null, start);
    const dry = advanceRainState(weather(start + 15 * minute, 0, 0), wet, start + 15 * minute);
    const repeated = advanceRainState(weather(start + 15 * minute, 0, 0), dry, start + 20 * minute);
    expect(repeated.drySince).toBe(start + 15 * minute);
    const updated = advanceRainState(
      weather(start + 30 * minute, 0, 0),
      repeated,
      start + 30 * minute,
    );
    expect(isAutomaticRainActive(updated, start + 44 * minute, start + 44 * minute)).toBe(true);
    expect(isAutomaticRainActive(updated, start + 45 * minute, start + 45 * minute)).toBe(false);
  });

  it('uma nova indicação de chuva cancela a contagem de desligamento', () => {
    let state = advanceRainState(weather(), null, start);
    state = advanceRainState(weather(start + 15 * minute, 0, 0), state, start + 15 * minute);
    state = advanceRainState(weather(start + 30 * minute), state, start + 30 * minute);
    expect(state.drySince).toBeNull();
    expect(isAutomaticRainActive(state, start + 45 * minute, start + 45 * minute)).toBe(true);
  });

  it('código isolado não cancela nem reinicia a espera de desligamento', () => {
    let state = advanceRainState(weather(), null, start);
    for (const elapsed of [15, 20, 30, 40, 45]) {
      state = advanceRainState(
        weather(start + elapsed * minute, 0, 61),
        state,
        start + elapsed * minute,
      );
      expect(state.raining).toBe(false);
      expect(state.drySince).toBe(start + 15 * minute);
      expect(isAutomaticRainActive(state, start + elapsed * minute, start + elapsed * minute)).toBe(
        elapsed < 45,
      );
    }
  });

  it('cache precisa identificar a regra atual e respeitar volume e código juntos', () => {
    const state = advanceRainState(weather(), null, start);
    expect(rainStateSchema.safeParse({ ...state, policyVersion: undefined }).success).toBe(false);
    expect(rainStateSchema.safeParse({ ...state, policyVersion: 1 }).success).toBe(false);
    expect(rainStateSchema.safeParse({ ...state, rainMm: 0 }).success).toBe(false);
    expect(rainStateSchema.safeParse({ ...state, weatherCode: 3 }).success).toBe(false);
  });

  it('resposta repetida não renova validade nem aplica chuva a instante anterior ou futuro', () => {
    const state = advanceRainState(weather(), null, start + 2 * minute);
    const repeated = advanceRainState(weather(), state, start + 20 * minute);
    expect(repeated.observedAt).toBe(start);
    expect(isAutomaticRainActive(repeated, start, start + 20 * minute)).toBe(false);
    expect(isAutomaticRainActive(repeated, start + 21 * minute, start + 20 * minute)).toBe(false);
    expect(isAutomaticRainActive(repeated, start + RAIN_MAX_AGE_MS, start + RAIN_MAX_AGE_MS)).toBe(
      false,
    );
  });

  it('descarta continuidade após interrupção longa em vez de inventar trinta minutos secos', () => {
    const state = advanceRainState(weather(), null, start);
    const recovered = advanceRainState(
      weather(start + 60 * minute, 0, 0),
      state,
      start + 60 * minute,
    );
    expect(recovered.activeSince).toBeNull();
    expect(recovered.drySince).toBe(start + 60 * minute);
  });

  it.each([
    {},
    { ...weather(), current: { ...weather().current, rain: null } },
    { ...weather(), current: { ...weather().current, rain: -1 } },
    { ...weather(), current: { ...weather().current, weather_code: 900 } },
    { ...weather(), current: { ...weather().current, interval: undefined } },
    { ...weather(), current: { ...weather().current, interval: 3600 } },
    { ...weather(), current: { ...weather().current, interval: 0 } },
    { ...weather(), latitude: -9.65 },
    { ...weather(), current_units: { time: 'unixtime', rain: 'inch', showers: 'mm' } },
    weather(start - RAIN_MAX_AGE_MS),
    weather(start + minute),
  ])('rejeita dado inválido, antigo, futuro ou de outra cidade (%#)', (payload) => {
    expect(() => advanceRainState(payload, null, start)).toThrow();
  });

  it('não retrocede para amostra anterior à última recebida', () => {
    const state = advanceRainState(weather(start + minute), null, start + minute);
    expect(() => advanceRainState(weather(), state, start + 2 * minute)).toThrow();
  });
});
