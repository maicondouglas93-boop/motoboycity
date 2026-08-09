// Dados fictícios apenas para reproduzir a estrutura visual das telas
// (Fase 9). Nenhum destes dados vem da API — não há integração real ainda.

export const mockDriver = {
  name: 'Maicon Douglas',
  email: 'maicondouglas93@gmail.com',
  phone: '(33) 99868-0141',
  version: '2.14.3',
};

export const mockWallet = {
  availableBalance: 'R$ 7.495,18',
  blockedBalance: 'R$ 876,63',
};

export const mockWalletTransactions = [
  {
    id: '23247',
    description: 'Repasse automático do pedido #23247',
    status: 'Aguardando',
    value: 'R$ 5,40',
    date: '07/08/2026 22:50',
    releaseDate: 'Liberação em 09/08 00:00',
  },
  {
    id: '23234',
    description: 'Repasse automático do pedido #23234',
    status: 'Aguardando',
    value: 'R$ 9,68',
    date: '07/08/2026 22:35',
    releaseDate: 'Liberação em 09/08 00:00',
  },
];

export const mockHistorySummary = {
  period: '01/08 à 08/08 de 2026',
  earnings: 'R$ 1.190,53',
  deliveries: 135,
};

export const mockHistoryByDay = [
  {
    date: '07/08/2026',
    entries: [
      { time: '22:05', businessName: 'Cabana do Açaí', distance: '0.4km', value: 'R$ 4,95' },
      { time: '22:03', businessName: 'Cariocas Burguers', distance: '1.3km', value: 'R$ 5,40' },
      { time: '21:44', businessName: 'Cariocas Burguers', distance: '0.4km', value: 'R$ 4,95' },
    ],
  },
];

export const mockOrderDetail = {
  id: '23249',
  date: '07/08/26 às 22:05',
  status: 'Concluído',
  driverValue: 'R$ 4,95',
  paymentMethod: 'Faturado',
  address: 'Rua Madalena Satler, 160 -, Lajinha - MG, 36980-000',
  deliveriesCount: 1,
  customerName: 'Cabana do Açaí',
  customerPhone: '(33) 99857-8122',
};

export const mockSettings = {
  overlayOnMinimized: true,
  overlayOnOpen: true,
  overlaySize: 200,
  keepScreenOn: true,
  defaultMap: 'Waze',
  notificationSound: 'Papa-léguas',
  appVersion: '2.14.3',
};
