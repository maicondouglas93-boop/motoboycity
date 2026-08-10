import { create } from 'zustand';
import type { DeliveryOfferPayload, DriverAvailability } from '@motoboycity/types';

interface DispatchState {
  availability: DriverAvailability;
  since: string | null;
  incomingOffer: DeliveryOfferPayload | null;
  socketConnected: boolean;
  setPresence: (availability: DriverAvailability, since: string | null) => void;
  setIncomingOffer: (offer: DeliveryOfferPayload | null) => void;
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
  socketConnected: false,
  setPresence: (availability, since) => set({ availability, since }),
  setIncomingOffer: (incomingOffer) => set({ incomingOffer }),
  setSocketConnected: (socketConnected) => set({ socketConnected }),
}));
