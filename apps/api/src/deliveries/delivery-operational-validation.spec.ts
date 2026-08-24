import {
  createDeliveryBatchSchema,
  createDeliverySchema,
  deliveryOperationsQuerySchema,
  deliveryStageTimesQuerySchema,
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
  it('aceita chave de repeticao UUID na criacao individual e no lote', () => {
    const idempotencyKey = '22222222-2222-4222-8222-222222222222';

    expect(createDeliverySchema.safeParse({ ...knownDelivery, idempotencyKey }).success).toBe(true);
    expect(
      createDeliveryBatchSchema.safeParse({
        idempotencyKey,
        deliveries: [knownDelivery, knownDelivery],
      }).success,
    ).toBe(true);
  });

  it('recusa chave de repeticao fora do formato UUID', () => {
    expect(
      createDeliverySchema.safeParse({ ...knownDelivery, idempotencyKey: 'pedido-123' }).success,
    ).toBe(false);
  });

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

  it('aceita recorte operacional por lote ou pedido e exige UUID', () => {
    const batchId = '22222222-2222-4222-8222-222222222222';
    const deliveryId = '33333333-3333-4333-8333-333333333333';

    expect(deliveryOperationsQuerySchema.safeParse({ batchId }).success).toBe(true);
    expect(deliveryOperationsQuerySchema.safeParse({ deliveryId }).success).toBe(true);
    expect(deliveryOperationsQuerySchema.safeParse({ batchId: 'lote-123' }).success).toBe(false);
    expect(deliveryOperationsQuerySchema.safeParse({ deliveryId: 'pedido-123' }).success).toBe(
      false,
    );
  });

  it('limita o relatorio de SLA a no maximo 366 dias', () => {
    expect(
      deliveryStageTimesQuerySchema.safeParse({ from: '2026-01-01', to: '2027-01-01' }).success,
    ).toBe(true);
    expect(
      deliveryStageTimesQuerySchema.safeParse({ from: '2026-01-01', to: '2027-01-02' }).success,
    ).toBe(false);
  });
});
