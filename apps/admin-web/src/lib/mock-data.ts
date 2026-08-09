// Dados fictícios apenas para reproduzir a estrutura visual das telas
// (Fase 8). Nenhum destes dados vem da API — não há integração real ainda.

export const mockDeliveriesByDay = [4, 6, 3, 8, 5, 9, 7, 6, 4, 8];

export const mockAdminUser = {
  name: 'Franklin Joaquim de Melo',
  email: 'franklin@motoboycity.com.br',
};

export const mockInvoiceWarning = {
  daysUntilDue: 4,
  dueDate: '12/08/2026',
};

export type OrderCard = {
  id: string;
  time: string;
  etaOrDuration: string;
  statusLabel: string;
  businessName: string;
  driverName: string;
  distanceKm: string;
  value: string;
  driverValue: string;
};

export const mockOrdersByStage: Record<string, OrderCard[]> = {
  tocando: [],
  aceitos: [
    {
      id: '23297',
      time: '13:17',
      etaOrDuration: '10m 12s',
      statusLabel: 'Aceito',
      businessName: 'Drogaria Ideal',
      driverName: 'Edinho',
      distanceKm: '0,00 km',
      value: 'R$ 0,00',
      driverValue: 'R$ 0,00',
    },
    {
      id: '23298',
      time: '13:18',
      etaOrDuration: '18m 9s',
      statusLabel: 'Aceito',
      businessName: 'Lilimodas',
      driverName: 'Edinho',
      distanceKm: '0,00 km',
      value: 'R$ 0,00',
      driverValue: 'R$ 0,00',
    },
  ],
  coletados: [
    {
      id: '23285',
      time: '12:33',
      etaOrDuration: '46m 59s',
      statusLabel: 'Coletado',
      businessName: 'Drogaria Ideal',
      driverName: 'Edinho',
      distanceKm: '0,00 km',
      value: 'R$ 0,00',
      driverValue: 'R$ 0,00',
    },
  ],
  retorno: [
    {
      id: '23295',
      time: '13:12',
      etaOrDuration: '3m 13s',
      statusLabel: 'Entregue',
      businessName: 'Lá na Vita Delivery',
      driverName: 'Edinho',
      distanceKm: '3,36 km',
      value: 'R$ 6,00',
      driverValue: 'R$ 5,40',
    },
  ],
};

export const mockRecentlyCompleted: OrderCard[] = [
  {
    id: '23294',
    time: '13:11',
    etaOrDuration: '',
    statusLabel: 'Concluído',
    businessName: 'Lá na Vita Delivery',
    driverName: 'Fernandinho',
    distanceKm: '0,37 km',
    value: 'R$ 5,50',
    driverValue: 'R$ 4,95',
  },
  {
    id: '23293',
    time: '13:11',
    etaOrDuration: '',
    statusLabel: 'Concluído',
    businessName: 'Lá na Vita Delivery',
    driverName: 'Edinho',
    distanceKm: '0,75 km',
    value: 'R$ 5,50',
    driverValue: 'R$ 4,95',
  },
];

export const mockDriverQueue = [
  { position: 1, name: 'Edinho' },
  { position: 2, name: 'Fernandinho' },
];

export const mockOnlineDrivers = [
  { name: 'Fernandinho', ongoingCount: 2 },
  { name: 'Edinho', ongoingCount: 4 },
];

export const mockLiveActivity = [
  { message: 'Pedido #23301 tocando — Lá na Vita Delivery', time: 'agora' },
  { message: 'Edinho entregou #23298 — Lilimodas', time: 'há 2 min' },
  { message: 'Fernandinho entregou #23299 — Bar do Adelaide', time: 'há 3 min' },
  { message: 'Edinho coletou #23297 — Drogaria Ideal', time: 'há 5 min' },
];

export const mockClientDetailStats = {
  walletBalance: 'R$ 0,00',
  lastOrder: 'há 1 hora',
  firstOrder: '20/03/2026 15:30',
  totalSpent: 'R$ 34.194,48',
  totalOrders: 489,
  cancelledOrders: 5,
  averageTicket: 'R$ 5,06',
  cancellationRate: '1,02%',
  averageDeliveryTime: '51,33 min',
  mostUsedService: 'motoboy',
  mostUsedPaymentMethod: 'Faturado',
  totalCommission: 'R$ 125,98',
};

export const mockDriverStats = { totalDeliveries: 26, onlineNow: 2 };

export const mockPendingDrivers = 13;
export const mockBlockedDrivers = 16;
export const mockDriverSignupLink = 'https://motoboycity.app.br/cadastro-entregador';

export const mockDrivers = [
  {
    name: 'Fernandinho',
    phone: '(33) 98812-7930',
    appVersion: '2.14.0-2.14.0',
    serviceType: 'motoboy',
    active: true,
    lastSeen: 'há 29 segundos',
    status: 'Ativo',
  },
  {
    name: 'Mateus Josué Brito Rocha',
    phone: '(33) 99666-5644',
    appVersion: '2.4.9-2.4.9',
    serviceType: 'motoboy',
    active: false,
    lastSeen: 'há 8 meses',
    status: 'Suspenso',
  },
  {
    name: 'Franklim Joaquim de Melo Neto',
    phone: '(19) 99706-0303',
    appVersion: '2.5.0-2.5.0',
    serviceType: 'motoboy',
    active: false,
    lastSeen: 'há 8 meses',
    status: 'Suspenso',
  },
  {
    name: 'Edimar Serpa Terra',
    phone: '(29) 99885-1798',
    appVersion: '2.4.2-2.4.2',
    serviceType: 'motoboy',
    active: false,
    lastSeen: 'há 9 meses',
    status: 'Suspenso',
  },
  {
    name: 'Maicon Douglas',
    phone: '(33) 99868-0141',
    appVersion: '2.14.3-2.14.3',
    serviceType: 'motoboy',
    active: false,
    lastSeen: 'há 14 horas',
    status: 'Ativo',
  },
];

export const mockDriverDetailStats = {
  walletBalance: 'R$ 0,87',
  status: 'Ativo',
  firstOrder: 'há 1 ano',
  lastOrder: 'há 21 minutos',
  totalOrders: 617,
  totalDeliveries: 617,
  cancelledOrders: 1,
  averageTicket: 'R$ 6,19',
  cancellationRate: '0,16%',
  averageAcceptTime: '0,00 min',
  averageCollectTime: '8,99 min',
  averageDeliveryTime: '40,77 min',
  mostUsedPaymentMethod: 'Faturado',
  totalEarned: 'R$ 3.471,59',
  ranking: '3º',
};

export const mockWalletTransactions = [
  {
    date: '03/08/25 13:44',
    status: 'aguardando',
    description: 'Repasse automático do pedido #23296',
    creditedValue: 'R$ 5,40',
    debitedValue: '-',
  },
  {
    date: '03/08/25 13:38',
    status: 'aguardando',
    description: 'Repasse automático do pedido #23295',
    creditedValue: 'R$ 4,95',
    debitedValue: '-',
  },
];

export const mockWithdrawalRequests = [
  { date: '02/08/2026 08:24:44', value: 'R$ 589,00', status: 'Aprovado' },
  { date: '26/07/2026 09:40:49', value: 'R$ 500,00', status: 'Aprovado' },
  { date: '10/07/2026 04:29:05', value: 'R$ 1.037,00', status: 'Aprovado' },
];

export const mockReportCategories = [
  {
    title: 'Pedidos',
    reports: [
      'Pedidos por Data',
      'Histórico de Entregas',
      'Pedidos Faturados',
      'Pedidos Cancelados',
      'Pedidos por Canal',
      'Valores por Forma de Pagamento do Pedido',
    ],
  },
  {
    title: 'Operação',
    reports: ['Histórico de Pico', 'Tempos e SLA', 'Inconsistências de Entrega'],
  },
  {
    title: 'Entregadores',
    reports: ['Pedidos por Entregador', 'Distribuição de Pedidos por Entregador'],
  },
];

export const mockIntegrations = [
  'iFood',
  'PDV Integrado',
  'PDV Integrado - Frood',
  'iFood Integrado - Delivery Much',
  'Já Delivery',
  'Cardápio Web',
  'Anota aí',
  'Aiqfome',
];

export const mockInvoices: {
  number: string;
  status: string;
  issueDate: string;
  value: string;
  dueDate: string;
  paymentDate: string;
  paymentMethod: string;
}[] = [];

export const mockFinanceSummary = {
  unbilledOrders: 'R$ 6.323,00',
  pendingInvoices: 'R$ 0,00',
  overdueInvoices: 'R$ 308,11',
  totalReceivable: 'R$ 6.631,11',
  clientWalletAvailable: 'R$ 0,00',
  clientWalletNegative: 'R$ 0,00',
  driverWalletAvailable: 'R$ 7.534,24',
  driverWalletNegative: 'R$ 642,14',
  pendingWithdrawals: 'R$ 500,00',
  blockedInWallets: 'R$ 4.358,61',
};

export const mockFinanceAnalytics = {
  invoicesReceived: 'R$ 11.313,14',
  clientBalanceAdded: 'R$ 0,00',
  driverBalanceAdded: 'R$ 0,00',
  onlinePayments: 'R$ 0,00',
  withdrawalsRequested: 'R$ 4.444,33',
  withdrawalsPaid: 'R$ 3.944,33',
  withdrawalsPending: 'R$ 500,00',
  driverTotal: 'R$ 5.228,69',
  commissionTotal: 'R$ 550,89',
  grandTotal: 'R$ 5.779,58',
};

export const mockDriverWallets = [
  { name: 'Antônio Carlos Lopes', available: 'R$ 0,00', blocked: 'R$ 0,00', requested: 'R$ 0,00' },
  {
    name: 'Baltazar Cortez Teixeira',
    available: 'R$ 0,27',
    blocked: 'R$ 0,00',
    requested: 'R$ 0,00',
  },
  { name: 'Betinho', available: 'R$ 0,00', blocked: 'R$ 0,00', requested: 'R$ 0,00' },
];

export const mockPendingInvoiceOrders = [
  {
    id: '22415',
    date: '01/08/2026',
    client: 'Drogaria Nova Farma',
    driverValue: 'R$ 4,75',
    appValue: 'R$ 0,25',
    total: 'R$ 5,00',
  },
  {
    id: '22416',
    date: '01/08/2026',
    client: 'Drogaria Ideal',
    driverValue: 'R$ 5,40',
    appValue: 'R$ 0,60',
    total: 'R$ 6,00',
  },
  {
    id: '22417',
    date: '01/08/2026',
    client: 'Bar do Adelaide',
    driverValue: 'R$ 8,95',
    appValue: 'R$ 1,00',
    total: 'R$ 9,95',
  },
];

export const mockReceiptsByDay = [
  {
    date: '02/08/2026',
    total: 'R$ 578,22',
    invoices: [
      { number: 'FAT-2026-0302', client: 'Sorveteria Sol de Verão', value: 'R$ 429,77' },
      { number: 'FAT-2026-0315', client: 'Joãozinho Lanches', value: 'R$ 115,45' },
    ],
  },
];

export const mockConfigCategories = [
  { title: '', items: ['Gerais e Marca', 'Nomenclaturas', 'Seus Termos e Políticas'] },
  {
    title: 'Cobertura e Operação',
    items: [
      'Múltiplas Praças',
      'Definições de Região',
      'Distâncias Permitidas',
      'Horário de Funcionamento',
    ],
  },
  {
    title: 'Preços e Tarifas',
    items: ['Tabela de Preços', 'Tarifa Dinâmica', 'Taxa de Chuva', 'Valores Transportados'],
  },
  {
    title: 'Criação e Distribuição',
    items: [
      'Tipos de Serviços',
      'Modelos de Importação',
      'Agendamento de Pedidos',
      'Distribuição de Pedidos',
      'Agrupamento Inteligente',
    ],
  },
];
