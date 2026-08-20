import {
  createDeliveryBatchSchema,
  createDeliverySchema,
  searchDeliveriesQuerySchema,
} from '@motoboycity/validation';

const knownDelivery = {
  serviceTypeId: '11111111-1111-4111-8111-111111111111',
  destinationKnownAtCreation: true,
  dropoffAddress: {
    street: 'Rua Teste',
    number: '10',
    city: 'Lajinha',
    state: 'MG',
    zip: '36930000',
    lat: -20.153,
    lng: -41.622,
  },
};

describe('contratos operacionais de entrega', () => {
  it('aceita metadados e coordenadas completas do Google', () => {
    expect(
      createDeliverySchema.safeParse({
        ...knownDelivery,
        recipientName: 'Maria',
        recipientPhone: '33999990000',
        externalOrderNumber: 'AIQ-123',
        driverNote: 'Interfone 2',
        customerPaymentMethod: 'PIX',
      }).success,
    ).toBe(true);
  });

  it('recusa latitude sem longitude', () => {
    const result = createDeliverySchema.safeParse({
      ...knownDelivery,
      dropoffAddress: { ...knownDelivery.dropoffAddress, lng: undefined },
    });
    expect(result.success).toBe(false);
  });

  it('recusa lote que mistura destino conhecido e destino definido por GPS', () => {
    const result = createDeliveryBatchSchema.safeParse({
      deliveries: [
        knownDelivery,
        {
          serviceTypeId: knownDelivery.serviceTypeId,
          destinationKnownAtCreation: false,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('normaliza paginação e recusa período invertido', () => {
    expect(searchDeliveriesQuerySchema.parse({}).pageSize).toBe(25);
    expect(
      searchDeliveriesQuerySchema.safeParse({ from: '2026-08-20', to: '2026-08-19' }).success,
    ).toBe(false);
  });
});
