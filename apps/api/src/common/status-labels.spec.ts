import { deliveryActivityMessage, offerActivityMessage } from './status-labels';

describe('mensagens da atividade operacional', () => {
  it('identifica empresa e motoboy na coleta e na entrega', () => {
    expect(
      deliveryActivityMessage({
        displayNumber: 12,
        companyName: 'Drogaria Nova Farma',
        status: 'COLLECTED',
        driverName: 'Maicon Douglas',
      }),
    ).toBe('Pedido #12 da empresa Drogaria Nova Farma foi coletado por Maicon Douglas.');

    expect(
      deliveryActivityMessage({
        displayNumber: 12,
        companyName: 'Drogaria Nova Farma',
        status: 'DELIVERED',
        driverName: 'Maicon Douglas',
      }),
    ).toBe('Pedido #12 da empresa Drogaria Nova Farma foi entregue por Maicon Douglas.');
  });

  it('nao atribui cancelamento ao motoboy, pois o autor pode ser outro perfil', () => {
    expect(
      deliveryActivityMessage({
        displayNumber: 11,
        companyName: 'Drogaria Nova Farma',
        status: 'CANCELLED',
        driverName: 'Maicon Douglas',
      }),
    ).toBe('Pedido #11 da empresa Drogaria Nova Farma foi cancelado.');
  });

  it('explicita quem respondeu a oferta e de qual empresa e o pedido', () => {
    expect(
      offerActivityMessage({
        displayNumber: 12,
        companyName: 'Drogaria Nova Farma',
        response: 'ACCEPTED',
        driverName: 'Maicon Douglas',
      }),
    ).toBe(
      'Oferta do pedido #12 da empresa Drogaria Nova Farma foi aceita por Maicon Douglas.',
    );
  });
});
