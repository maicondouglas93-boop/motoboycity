// Dados fictícios apenas para reproduzir a estrutura visual das telas
// (Fase 7). Nenhum destes dados vem da API — não há integração real ainda.

export const mockUser = {
  name: 'Franklin Joaquim de Melo',
  email: 'franklin@empresaparceira.com.br',
};

export const mockOngoingDeliveries = [
  {
    id: '23297',
    customerName: 'Cliente Exemplo Ltda',
    driverName: 'Edinho',
    status: 'Aceito',
    value: 'R$ 5,50',
  },
  {
    id: '23298',
    customerName: 'Loja Modelo',
    driverName: 'Fernandinho',
    status: 'Coletado',
    value: 'R$ 6,00',
  },
];

export const mockIndicators = {
  totalDeliveries: 0,
  cancelledDeliveries: 0,
  averageTicket: 'R$ 0,00',
  cancellationRate: '0,00%',
  averageDeliveryTime: '-',
  mostUsedService: '-',
  mostUsedPaymentMethod: '-',
};

export const mockDeliveriesByDay = [4, 6, 3, 8, 5, 9, 7, 6, 4, 8];

export const mockReportCategories = [
  {
    title: 'Pedidos',
    reports: [
      'Pedidos por Data',
      'Histórico de Entregas',
      'Pedidos Faturados',
      'Pedidos Cancelados',
      'Pedidos por Canal',
      'Valores por Forma de Pagamento',
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
