import { describe, expect, it } from 'vitest';
import type { PublicDeliveryTracking } from '@motoboycity/types';
import {
  applyPublicTrackingLocation,
  applyPublicTrackingUpdate,
} from '@/lib/public-delivery-tracking';

const active: PublicDeliveryTracking = {
  status: 'IN_TRANSIT',
  updatedAt: '2026-08-27T12:00:00.000Z',
  location: {
    lat: -19.92,
    lng: -43.93,
    capturedAt: '2026-08-27T12:00:00.000Z',
  },
};

describe('public delivery tracking realtime cache', () => {
  it('aplica uma nova posicao enquanto o rastreamento esta ativo', () => {
    const location = {
      lat: -19.91,
      lng: -43.92,
      capturedAt: '2026-08-27T12:01:00.000Z',
    };

    expect(applyPublicTrackingLocation(active, location)).toEqual({ ...active, location });
  });

  it('limpa a localizacao ao receber o encerramento', () => {
    expect(
      applyPublicTrackingUpdate(active, {
        status: 'COMPLETED',
        updatedAt: '2026-08-27T12:02:00.000Z',
        location: null,
      }),
    ).toEqual({
      status: 'COMPLETED',
      updatedAt: '2026-08-27T12:02:00.000Z',
      location: null,
    });
  });

  it('ignora posicoes tardias depois que o rastreamento encerrou', () => {
    const terminal: PublicDeliveryTracking = {
      status: 'CANCELLED',
      updatedAt: '2026-08-27T12:02:00.000Z',
      location: null,
    };

    expect(
      applyPublicTrackingLocation(terminal, {
        lat: -19.9,
        lng: -43.9,
        capturedAt: '2026-08-27T12:03:00.000Z',
      }),
    ).toBe(terminal);
  });
});
