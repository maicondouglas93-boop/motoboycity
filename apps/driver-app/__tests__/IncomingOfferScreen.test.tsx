import React from 'react';
import { NativeModules, Platform } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { DeliveryOfferPayload } from '@motoboycity/types';
import { IncomingOfferScreen } from '../src/screens/IncomingOfferScreen';
import { useDispatchStore } from '../src/store/dispatchStore';

const offer: DeliveryOfferPayload = {
  offerId: 'offer-foreground-1',
  deliveryId: 'delivery-1',
  displayNumber: 501,
  companyName: 'Empresa teste',
  paymentMethod: 'BILLED',
  totalValue: 10,
  driverValue: 8,
  platformValue: 2,
  distanceKm: 1.5,
  requiresReturn: false,
  expiresInSeconds: 60,
  expiresAtEpochMs: Date.now() + 60_000,
  deliveries: [
    {
      deliveryId: 'delivery-1',
      displayNumber: 501,
      serviceTypeName: 'Moto',
      destinationKnownAtCreation: true,
      pickupAddress: {
        street: 'Rua da coleta',
        number: '10',
        complement: null,
        city: 'Lajinha',
        state: 'MG',
        zip: null,
        referenceNote: null,
      },
      dropoffAddress: {
        street: 'Rua da entrega',
        number: '20',
        complement: null,
        city: 'Lajinha',
        state: 'MG',
        zip: null,
        referenceNote: null,
      },
      totalValue: 10,
      driverValue: 8,
      platformValue: 2,
      distanceKm: 1.5,
      requiresReturn: false,
    },
  ],
};

test('liga o alarme ao abrir a oferta e para ao sair da tela', async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  useDispatchStore.getState().setIncomingOffer(offer);
  const navigation = {
    goBack: jest.fn(),
    replace: jest.fn(),
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <IncomingOfferScreen
        navigation={navigation as never}
        route={{ key: 'offer-test', name: 'IncomingOffer' }}
      />,
    );
  });

  expect(NativeModules.OfferSession.startOfferAlarm).toHaveBeenCalledWith(offer.offerId);

  await ReactTestRenderer.act(async () => {
    renderer.unmount();
  });

  expect(NativeModules.OfferSession.stopOfferAlarm).toHaveBeenCalledWith(offer.offerId);
  useDispatchStore.getState().setIncomingOffer(null);
  jest.useRealTimers();
});
