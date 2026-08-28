import { aiqfomeOrderResponseSchema } from './aiqfome-orders.schemas';
import { mapAiqfomeOrderToDeliveryPayload } from './aiqfome-webhook.service';

const receivedAt = new Date('2026-08-28T12:00:00.000Z');
const serviceTypeId = '11111111-1111-4111-8111-111111111111';

function order(payment: { name: string; pre_paid: boolean; change?: number }) {
  return aiqfomeOrderResponseSchema.parse({
    data: {
      id: 68670787,
      created_at: '2026-08-28 09:00:00',
      is_cancelled: false,
      is_delivered: false,
      is_aiqentrega_delivery: false,
      is_pickup: false,
      is_scheduled: false,
      order_observations: 'Deixar na portaria',
      user: {
        name: 'Joao',
        surname: 'Silva',
        mobile_phone: '(33) 99999-0000',
        address: {
          street_name: 'Rua A',
          number: '10',
          complement: 'Apto 2',
          reference: 'Portao azul',
          city_name: 'Lajinha',
          state_uf: 'MG',
          zip_code: '36980-000',
          latitude: -20.15,
          longitude: -41.62,
        },
      },
      payment_method: payment,
      store: { id: 54044, name: 'Loja Teste', preparation_time: 10 },
    },
  });
}

describe('mapeamento aiqfome para pedido local', () => {
  it('agenda o pagamento online sem retorno', () => {
    const payload = mapAiqfomeOrderToDeliveryPayload(
      order({ name: 'Pagamento Online', pre_paid: true }),
      serviceTypeId,
      receivedAt,
      15,
    );

    expect(payload).toMatchObject({
      serviceTypeId,
      externalOrderNumber: '68670787',
      recipientName: 'Joao Silva',
      recipientPhone: '33999990000',
      customerPaymentMethod: 'PREPAID',
      requiresReturn: false,
      scheduledAt: '2026-08-28T12:15:00.000Z',
      dropoffAddress: {
        street: 'Rua A',
        number: '10',
        city: 'Lajinha',
        state: 'MG',
        zip: '36980-000',
        lat: -20.15,
        lng: -41.62,
      },
    });
    expect(payload.driverNote).toContain('Pagamento online confirmado');
  });

  it('marca retorno e informa cartao/troco no pagamento na entrega', () => {
    const payload = mapAiqfomeOrderToDeliveryPayload(
      order({ name: 'Visa Credito', pre_paid: false, change: 100 }),
      serviceTypeId,
      receivedAt,
      8,
    );

    expect(payload.customerPaymentMethod).toBe('CARD');
    expect(payload.requiresReturn).toBe(true);
    expect(payload.scheduledAt).toBe('2026-08-28T12:08:00.000Z');
    expect(payload.driverNote).toContain('Pagamento na entrega: Visa Credito');
    expect(payload.driverNote).toContain('Troco para R$ 100,00');
  });

  it('nao inventa uma categoria quando o metodo offline e desconhecido', () => {
    const payload = mapAiqfomeOrderToDeliveryPayload(
      order({ name: 'Vale local', pre_paid: false }),
      serviceTypeId,
      receivedAt,
      5,
    );

    expect(payload.customerPaymentMethod).toBeUndefined();
    expect(payload.requiresReturn).toBe(true);
    expect(payload.driverNote).toContain('Vale local');
  });
});
