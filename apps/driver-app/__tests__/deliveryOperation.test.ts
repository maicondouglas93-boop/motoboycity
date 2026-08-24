import type { DeliveryAddressItem } from '@motoboycity/types';
import {
  completeDeliveryRouteUrl,
  deliveryOperationCopy,
  deliveryPaymentLabel,
  formatDeliveryAddress,
  formatElapsedTime,
  formatOperationDateTime,
  navigationDestination,
} from '../src/lib/deliveryOperation';

const structuredAddress: DeliveryAddressItem = {
  type: 'PICKUP',
  street: 'Travessa João Caetano',
  number: '56',
  complement: 'Fundos',
  city: 'Lajinha',
  state: 'MG',
  zip: '36980-000',
  lat: null,
  lng: null,
  referenceNote: 'Portão azul',
};

describe('apresentação da operação de entrega', () => {
  it('formata o horário da operação no fuso de São Paulo', () => {
    expect(formatOperationDateTime('2026-08-23T20:14:00.000Z')).toBe('23/08/26 às 17:14');
  });

  it('mostra tempo decorrido sem inventar prazo de coleta', () => {
    expect(formatElapsedTime('2026-08-23T20:00:00.000Z', Date.parse('2026-08-23T20:29:54Z'))).toBe(
      '29:54',
    );
    expect(formatElapsedTime('2026-08-23T20:00:00.000Z', Date.parse('2026-08-23T21:02:03Z'))).toBe(
      '01:02:03',
    );
  });

  it('exibe todos os campos reais do endereço estruturado', () => {
    expect(formatDeliveryAddress(structuredAddress)).toBe(
      'Travessa João Caetano, 56\nFundos\nLajinha - MG, 36980-000\nReferência: Portão azul',
    );
    expect(navigationDestination(structuredAddress)).toBe(
      'Travessa João Caetano, 56, Fundos, Lajinha, MG, 36980-000',
    );
  });

  it('diferencia destino GPS de endereço ausente', () => {
    expect(
      formatDeliveryAddress({
        ...structuredAddress,
        street: null,
        number: null,
        complement: null,
        city: null,
        state: null,
        zip: null,
        referenceNote: null,
        lat: -20.1,
        lng: -41.2,
      }),
    ).toBe('Destino registrado pela localização da entrega');
  });

  it('monta a rota completa e inclui a volta quando ela é obrigatória', () => {
    const dropoff = {
      ...structuredAddress,
      type: 'DROPOFF',
      street: 'Rua Maria Constância Fonseca',
      number: '95',
      complement: null,
      referenceNote: null,
    };

    const directUrl = completeDeliveryRouteUrl(structuredAddress, dropoff, false);
    const returnUrl = completeDeliveryRouteUrl(structuredAddress, dropoff, true);

    expect(directUrl).toContain('origin=Travessa+Jo%C3%A3o+Caetano%2C+56');
    expect(directUrl).toContain('destination=Rua+Maria+Const%C3%A2ncia+Fonseca%2C+95');
    expect(directUrl).not.toContain('waypoints=');
    expect(returnUrl).toContain('destination=Travessa+Jo%C3%A3o+Caetano%2C+56');
    expect(returnUrl).toContain('waypoints=Rua+Maria+Const%C3%A2ncia+Fonseca%2C+95');
  });

  it('traduz pagamento e estados operacionais', () => {
    expect(deliveryPaymentLabel('BILLED')).toBe('Faturado');
    expect(deliveryPaymentLabel('ONLINE')).toBe('Pago online');
    expect(deliveryOperationCopy('ACCEPTED')).toEqual(
      expect.objectContaining({ statusLabel: 'Aceito', primaryActionLabel: 'Pedido coletado' }),
    );
    expect(deliveryOperationCopy('FAILED')).toEqual(
      expect.objectContaining({
        statusLabel: 'Devolução pendente',
        primaryActionLabel: 'Confirmar devolução na loja',
      }),
    );
  });
});
