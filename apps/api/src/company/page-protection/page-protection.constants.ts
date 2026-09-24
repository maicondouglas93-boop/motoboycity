import type { PageProtectionCatalogItem } from '@motoboycity/types';

export const PAGE_PROTECTION_KEY = 'PAGE_PROTECTION_ROUTE_KEY';
export const PAGE_UNLOCK_TOKEN_TYPE = 'PAGE_UNLOCK';
export const PAGE_UNLOCK_EXPIRATION_SECONDS = 30 * 60; // 30 minutos
export const PASSWORD_HASH_ROUNDS = 10;

export const PROTECTABLE_PAGE_CATALOG: PageProtectionCatalogItem[] = [
  {
    routeKey: 'FINANCEIRO',
    label: 'Financeiro',
    path: '/financeiro',
    description: 'Extratos, faturamento pendente, resumo financeiro e exportações contábeis.',
  },
  {
    routeKey: 'RELATORIOS',
    label: 'Relatórios',
    path: '/relatorios',
    description: 'Relatórios operacionais e métricas de desempenho de entregas.',
  },
  {
    routeKey: 'PEDIDOS',
    label: 'Pedidos',
    path: '/pedidos',
    description: 'Central de pedidos ativos, histórico e criação de entregas.',
  },
  {
    routeKey: 'CLIENTES',
    label: 'Clientes',
    path: '/clientes',
    description: 'Carteira de clientes cadastrados e histórico de destinos.',
  },
];
