import React from 'react';
import { NativeModules, Platform } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { DeliveryOfferPayload } from '@motoboycity/types';
import { Text } from 'react-native';
import { clearDriverProfile, setDriverProfile } from '../src/lib/driverProfileCache';
import { mostraValores } from '../src/lib/remuneracao';
import { IncomingOfferScreen } from '../src/screens/IncomingOfferScreen';
import { useDispatchStore } from '../src/store/dispatchStore';

const offer: DeliveryOfferPayload = {
  offerId: 'offer-foreground-1',
  deliveryId: 'delivery-1',
  displayNumber: 501,
  companyName: 'Empresa teste',
  urgent: false,
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
      urgent: false,
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

/**
 * Motoboy de salario fixo: a entrega fica inteira com a plataforma, e o app nao
 * mostra valores a ele. A oferta sai sem o "Voce recebe".
 */
describe('oferta e remuneracao', () => {
  async function textosDaOferta(): Promise<string> {
    useDispatchStore.getState().setIncomingOffer(offer);
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <IncomingOfferScreen
          navigation={{ goBack: jest.fn(), replace: jest.fn() } as never}
          route={{ key: 'offer-test', name: 'IncomingOffer' }}
        />,
      );
    });
    const textos = renderer.root
      .findAllByType(Text)
      .map((node) => [node.props.children].flat().join(''))
      .join(' | ');
    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
    useDispatchStore.getState().setIncomingOffer(null);
    return textos;
  }

  afterEach(() => clearDriverProfile());

  test('so o salario fixo esconde valores; perfil sem o campo recebe por corrida', () => {
    expect(mostraValores({ driverCompensation: 'SALARIED' })).toBe(false);
    expect(mostraValores({ driverCompensation: 'PER_DELIVERY' })).toBe(true);
    expect(mostraValores({})).toBe(true);
  });

  test('por corrida: a oferta mostra quanto ele recebe', async () => {
    setDriverProfile('token', {
      id: 'user-1',
      name: 'Motoboy',
      email: 'motoboy@example.com',
      type: 'DRIVER',
      avatarUrl: null,
      driverCompensation: 'PER_DELIVERY',
    });

    const textos = await textosDaOferta();

    expect(textos).toContain('Você recebe');
  });

  test('salario fixo: a oferta sai sem valor', async () => {
    setDriverProfile('token', {
      id: 'user-1',
      name: 'Motoboy',
      email: 'motoboy@example.com',
      type: 'DRIVER',
      avatarUrl: null,
      driverCompensation: 'SALARIED',
    });

    const textos = await textosDaOferta();

    expect(textos).not.toContain('Você recebe');
    expect(textos).not.toMatch(/R\$/);
    expect(textos).not.toContain('valor será calculado');
  });
});
