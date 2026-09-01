import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompanyAddressItem, OperationalDeliveryItem } from '@motoboycity/types';
import { CompanyOperationsMap } from './company-operations-map';

const mocks = vi.hoisted(() => ({
  loadGoogleMaps: vi.fn(),
  retratoDoMotoboy: vi.fn(),
}));

vi.mock('@/lib/google-maps', () => ({
  loadGoogleMaps: mocks.loadGoogleMaps,
  onGoogleMapsAuthFailure: () => () => undefined,
}));

vi.mock('@/lib/marcador-de-motoboy', () => ({
  retratoDoMotoboy: mocks.retratoDoMotoboy,
}));

class FakeLatLng {
  constructor(private readonly position: google.maps.LatLngLiteral) {}

  lat() {
    return this.position.lat;
  }

  lng() {
    return this.position.lng;
  }
}

class FakeMarker {
  static instances: FakeMarker[] = [];

  readonly setMap = vi.fn();
  readonly setPosition = vi.fn((position: google.maps.LatLngLiteral) => {
    this.position = position;
  });
  readonly setIcon = vi.fn();
  readonly setTitle = vi.fn();
  readonly addListener = vi.fn(() => ({ remove: vi.fn() }));

  private position: google.maps.LatLngLiteral;
  readonly title: string;

  constructor(options: google.maps.MarkerOptions) {
    this.position = options.position as google.maps.LatLngLiteral;
    this.title = options.title ?? '';
    FakeMarker.instances.push(this);
  }

  getPosition() {
    return new FakeLatLng(this.position);
  }
}

class FakeMap {
  readonly setCenter = vi.fn();
  readonly setZoom = vi.fn();
  readonly fitBounds = vi.fn();

  getZoom() {
    return 15;
  }
}

class FakeBounds {
  readonly extend = vi.fn();
}

const googleMaps = {
  maps: {
    Map: FakeMap,
    Marker: FakeMarker,
    LatLngBounds: FakeBounds,
    SymbolPath: { CIRCLE: 'CIRCLE' },
    Size: class FakeSize {},
    Point: class FakePoint {},
    event: { addListenerOnce: vi.fn() },
  },
};

const pickup = {
  lat: -20.151,
  lng: -41.622,
} as CompanyAddressItem;

function delivery(driverLat: number, driverLng: number): OperationalDeliveryItem {
  return {
    id: 'delivery-1',
    displayNumber: 451,
    status: 'ACCEPTED',
    addresses: [
      {
        type: 'DROPOFF',
        lat: -20.155,
        lng: -41.625,
      },
    ],
    lastLocation: {
      lat: driverLat,
      lng: driverLng,
    },
    driver: {
      id: 'driver-1',
      name: 'Motoboy Teste',
      avatarUrl: 'https://example.com/avatar.png',
    },
  } as OperationalDeliveryItem;
}

describe('CompanyOperationsMap markers', () => {
  beforeEach(() => {
    FakeMarker.instances = [];
    mocks.loadGoogleMaps.mockResolvedValue(googleMaps);
    mocks.retratoDoMotoboy.mockResolvedValue('data:image/png;base64,retrato');
    Object.assign(globalThis, { google: googleMaps });
  });

  it('move o marcador existente sem apagar ou reconstruir todos os pontos', async () => {
    const onSelect = vi.fn();
    const view = render(
      <CompanyOperationsMap
        pickupAddress={pickup}
        deliveries={[delivery(-20.152, -41.623)]}
        selectedId={null}
        onSelect={onSelect}
      />,
    );

    await waitFor(() => expect(FakeMarker.instances).toHaveLength(3));
    const driverMarker = FakeMarker.instances.find((marker) => marker.title.startsWith('Motoboy:'));
    expect(driverMarker).toBeDefined();
    await waitFor(() => expect(driverMarker?.setIcon).toHaveBeenCalledTimes(1));

    view.rerender(
      <CompanyOperationsMap
        pickupAddress={pickup}
        deliveries={[delivery(-20.154, -41.624)]}
        selectedId={null}
        onSelect={onSelect}
      />,
    );

    await waitFor(() =>
      expect(driverMarker?.setPosition).toHaveBeenCalledWith({ lat: -20.154, lng: -41.624 }),
    );
    expect(FakeMarker.instances).toHaveLength(3);
    expect(driverMarker?.setMap).not.toHaveBeenCalledWith(null);
    expect(driverMarker?.setIcon).toHaveBeenCalledTimes(1);
  });
});
