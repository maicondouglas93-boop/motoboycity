import type { DeliveryAddressItem } from '@motoboycity/types';
import {
  capturedDestinationLabel,
  completeDeliveryRouteUrl,
  deliverConfirmationSummary,
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

  it('mostra rua, valor e numero do pedido antes de confirmar a entrega', () => {
    const summary = deliverConfirmationSummary({
      displayNumber: 128,
      companyName: 'Elite Pizzaria',
      destinationKnownAtCreation: true,
      driverValue: 9.5,
      requiresReturn: false,
      returnValue: null,
      addresses: [
        structuredAddress,
        { ...structuredAddress, type: 'DROPOFF', street: 'Rua Macanaiba', number: '14' },
      ],
    });

    expect(summary.orderLabel).toBe('#128 - Elite Pizzaria');
    expect(summary.destination).toContain('Rua Macanaiba, 14');
    expect(summary.driverValue.replace(/\s/g, ' ')).toBe('R$ 9,50');
    expect(summary.returnValue).toBeNull();
    expect(summary.gpsNotice).toBeNull();
  });

  it('avisa quando o destino e o valor so nascem no GPS da confirmacao', () => {
    const summary = deliverConfirmationSummary({
      displayNumber: 7,
      companyName: 'Farmacia Central',
      destinationKnownAtCreation: false,
      driverValue: null,
      requiresReturn: true,
      returnValue: 4,
      addresses: [structuredAddress],
    });

    expect(summary.destination).toBe(
      'Endereço de entrega definido pela localização no momento da entrega',
    );
    expect(summary.gpsNotice).toContain('onde você está agora');
    expect(summary.driverValue).toBe('A calcular na entrega');
    expect(summary.returnValue?.replace(/\s/g, ' ')).toBe('R$ 4,00');
  });

  it('formata o endereco identificado no ponto onde o motoboy esta', () => {
    expect(
      capturedDestinationLabel({
        street: 'Rua Arnaldo Leite Ribeiro',
        number: '212',
        city: 'Lajinha',
        state: 'MG',
        zip: '36980-000',
      }),
    ).toBe('Rua Arnaldo Leite Ribeiro, 212\nLajinha - MG, 36980-000');
  });

  it('nao finge endereco conferido quando o Google nao identificou a coordenada', () => {
    expect(capturedDestinationLabel(null)).toBeNull();
    expect(
      capturedDestinationLabel({ street: null, number: null, city: null, state: null, zip: null }),
    ).toBeNull();
  });
});
