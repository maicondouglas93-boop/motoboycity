import type { OperacaoDaLoja } from '@motoboycity/types';
import type {
  StoreDeliveryAreasPayload,
  StoreManualStatusPayload,
  StoreNotificationsPayload,
  StoreOrderTypesPayload,
  StorePaymentsPayload,
  StoreSchedulePayload,
} from '@motoboycity/validation';
import { parseJsonOrThrow } from './api-error';
import { apiFetch } from './http';

export interface CompanyStoreOperationApiConfig {
  baseUrl: string;
}

/**
 * Como a loja funciona, do lado do painel. Cada bloco grava sozinho e devolve a
 * operação inteira, já com o que outra aba mudou nos outros blocos.
 */
export function createCompanyStoreOperationApi({ baseUrl }: CompanyStoreOperationApiConfig) {
  async function gravar(accessToken: string, bloco: string, corpo: unknown) {
    const response = await apiFetch(`${baseUrl}/company/store/operation/${bloco}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    return parseJsonOrThrow<OperacaoDaLoja>(response);
  }

  return {
    async operation(accessToken: string): Promise<OperacaoDaLoja> {
      const response = await apiFetch(`${baseUrl}/company/store/operation`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return parseJsonOrThrow<OperacaoDaLoja>(response);
    },

    updateSchedule(accessToken: string, payload: StoreSchedulePayload) {
      return gravar(accessToken, 'schedule', payload);
    },

    /** Pausar, fechar ou abrir agora; `ajuste: null` volta ao horário. */
    updateStatus(accessToken: string, payload: StoreManualStatusPayload) {
      return gravar(accessToken, 'status', payload);
    },

    updateOrderTypes(accessToken: string, payload: StoreOrderTypesPayload) {
      return gravar(accessToken, 'order-types', payload);
    },

    updateNotifications(accessToken: string, payload: StoreNotificationsPayload) {
      return gravar(accessToken, 'notifications', payload);
    },

    /** As formas de pagamento aceitas. As online são recusadas sem a conta Asaas. */
    updatePayments(accessToken: string, payload: StorePaymentsPayload) {
      return gravar(accessToken, 'payments', payload);
    },

    /** Os bairros atendidos, cada um com a taxa que a loja cobra do cliente. */
    updateDeliveryAreas(accessToken: string, payload: StoreDeliveryAreasPayload) {
      return gravar(accessToken, 'delivery-areas', payload);
    },
  };
}
