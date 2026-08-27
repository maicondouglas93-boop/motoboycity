import { describe, expect, it } from 'vitest';
import { createPublicTrackingMotorcycleMarkerIcon } from './public-tracking-map';

describe('public tracking motorcycle marker', () => {
  it('usa uma moto em um marcador ancorado na posicao atual', () => {
    class Size {
      constructor(
        readonly width: number,
        readonly height: number,
      ) {}
    }
    class Point {
      constructor(
        readonly x: number,
        readonly y: number,
      ) {}
    }
    const maps = { maps: { Size, Point } } as unknown as typeof google;

    const icon = createPublicTrackingMotorcycleMarkerIcon(maps);

    expect(icon.url).toMatch(/^data:image\/svg\+xml/);
    expect(decodeURIComponent(icon.url)).toContain('&#x1F3CD;');
    expect(icon.scaledSize).toMatchObject({ width: 52, height: 59 });
    expect(icon.anchor).toMatchObject({ x: 26, y: 57 });
  });
});
