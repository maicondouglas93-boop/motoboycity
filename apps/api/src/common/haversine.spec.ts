import { haversineDistanceMeters } from './haversine';

describe('haversineDistanceMeters', () => {
  it('retorna 0 para o mesmo ponto', () => {
    expect(haversineDistanceMeters({ lat: -20.15, lng: -41.74 }, { lat: -20.15, lng: -41.74 })).toBe(0);
  });

  it('é simétrica', () => {
    const a = { lat: -20.15, lng: -41.74 };
    const b = { lat: -20.2, lng: -41.8 };
    expect(haversineDistanceMeters(a, b)).toBeCloseTo(haversineDistanceMeters(b, a), 6);
  });

  it('calcula uma distância conhecida entre dois pontos (~1.11km por grau de latitude no equador)', () => {
    const distance = haversineDistanceMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(distance).toBeGreaterThan(110_000);
    expect(distance).toBeLessThan(112_000);
  });
});
