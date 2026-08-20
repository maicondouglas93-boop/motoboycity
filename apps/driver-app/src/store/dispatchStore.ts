import { create } from 'zustand';
import type {
  DeliveryListItem,
  DeliveryOfferPayload,
  DriverAvailability,
} from '@motoboycity/types';

interface DispatchState {
  availability: DriverAvailability;
  since: string | null;
  incomingOffer: DeliveryOfferPayload | null;
  activeDeliveries: DeliveryListItem[];
  socketConnected: boolean;
  setPresence: (availability: DriverAvailability, since: string | null) => void;
  setIncomingOffer: (offer: DeliveryOfferPayload | null) => void;
  setActiveDeliveries: (deliveries: DeliveryListItem[]) => void;
  setSocketConnected: (connected: boolean) => void;
}

/**
 * Estado ao vivo do despacho, compartilhado entre HomeScreen (onde o
 * socket é conectado) e IncomingOfferScreen (que pode ser aberta e
 * atualizada por eventos de socket enquanto está montada) — Zustand em
 * vez de Context pra evitar re-render de toda a árvore a cada evento.
 */
export const useDispatchStore = create<DispatchState>((set) => ({
  availability: 'UNAVAILABLE',
  since: null,
  incomingOffer: null,
  activeDeliveries: [],
  socketConnected: false,
  setPresence: (availability, since) => set({ availability, since }),
  setIncomingOffer: (incomingOffer) => set({ incomingOffer }),
  setActiveDeliveries: (activeDeliveries) => set({ activeDeliveries }),
  setSocketConnected: (socketConnected) => set({ socketConnected }),
}));
