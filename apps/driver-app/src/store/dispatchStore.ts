import { create } from 'zustand';
import type {
  DeliveryOfferPayload,
  DriverAvailability,
  DriverPunishmentStatus,
} from '@motoboycity/types';
import type { ActiveDeliveryItem } from '../lib/activeDeliveries';
import { stableOfferDeadline } from '../lib/offerDeadline';

interface DispatchState {
  availability: DriverAvailability;
  wantsToBeAvailable: boolean;
  since: string | null;
  incomingOffer: DeliveryOfferPayload | null;
  incomingOfferExpiresAtMs: number | null;
  activeDeliveries: ActiveDeliveryItem[];
  socketConnected: boolean;
  /**
   * Punicao em vigor: ele continua online, mas nenhuma oferta chega.
   *
   * Sem este estado o aplicativo fica mudo no pior momento possivel — botao
   * Ativo ligado, nenhuma corrida entrando — e a conclusao natural do motoboy
   * e que o aplicativo quebrou.
   */
  punishment: DriverPunishmentStatus | null;
  setPresence: (availability: DriverAvailability, since: string | null) => void;
  setPunishment: (punishment: DriverPunishmentStatus | null) => void;
  setWantsToBeAvailable: (available: boolean) => void;
  setIncomingOffer: (offer: DeliveryOfferPayload | null) => void;
  setActiveDeliveries: (deliveries: ActiveDeliveryItem[]) => void;
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
  wantsToBeAvailable: false,
  since: null,
  incomingOffer: null,
  incomingOfferExpiresAtMs: null,
  activeDeliveries: [],
  socketConnected: false,
  punishment: null,
  setPresence: (availability, since) => set({ availability, since }),
  setPunishment: (punishment) => set({ punishment }),
  setWantsToBeAvailable: (wantsToBeAvailable) => set({ wantsToBeAvailable }),
  setIncomingOffer: (incomingOffer) =>
    set((state) => {
      if (!incomingOffer) {
        return { incomingOffer: null, incomingOfferExpiresAtMs: null };
      }
      return {
        incomingOffer,
        incomingOfferExpiresAtMs: stableOfferDeadline(
          state.incomingOffer?.offerId ?? null,
          state.incomingOfferExpiresAtMs,
          incomingOffer.offerId,
          incomingOffer.expiresInSeconds,
          { expiresAtEpochMs: incomingOffer.expiresAtEpochMs },
        ),
      };
    }),
  setActiveDeliveries: (activeDeliveries) => set({ activeDeliveries }),
  setSocketConnected: (socketConnected) => set({ socketConnected }),
}));
