import type { AuthUser, OperationalDeliveryItem } from '@motoboycity/types';

export const printUser: AuthUser = {
  id: 'print-user', name: 'Operador de teste', email: 'print@example.test',
  type: 'COMPANY_MEMBER', avatarUrl: null,
};

export const printDelivery: OperationalDeliveryItem = {
  id: '11111111-1111-4111-8111-111111111111', displayNumber: 1234,
  companyId: 'print-company', companyName: 'Loja de teste Lajinha',
  serviceTypeId: 'print-service', serviceTypeName: 'Motoboy', batchId: null,
  status: 'AWAITING_DRIVER', destinationKnownAtCreation: true,
  distanceKm: 3, totalValue: 9, driverValue: 8, platformValue: 1,
  requiresReturn: false, returnValue: null, paymentMethod: 'BILLED',
  recipientName: 'Cliente de exemplo', recipientPhone: '(33) 90000-0000',
  externalOrderNumber: 'LOJA-42', driverNote: 'Tocar a campainha.\nEntregar na portaria.',
  customerPaymentMethod: 'CASH', requiresDeliveryProof: false,
  requiresCollectionRecipient: false, pickupSurchargeChargedToDriver: false,
  surchargeLabel: 'Taxa de teste', surchargeValue: 1,
  createdAt: '2026-09-10T15:30:00.000Z', statusChangedAt: '2026-09-10T15:30:00.000Z',
  pickupDeadlineAt: null, scheduledAt: null, driver: null, lastLocation: null,
  addresses: [{
    type: 'DROPOFF', street: 'Rua de exemplo', number: '20', complement: 'Casa dos fundos',
    city: 'Lajinha', state: 'MG', zip: '36980-000',
    referenceNote: 'Em frente à praça', lat: null, lng: null,
  }],
};
