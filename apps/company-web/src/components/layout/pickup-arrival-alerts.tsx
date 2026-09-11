'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bike, Volume2, VolumeX, X } from 'lucide-react';
import { io } from 'socket.io-client';
import { pickupArrivalEventSchema } from '@motoboycity/validation';
import type { PickupArrivalEvent } from '@motoboycity/types';
import { apiBaseUrl } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function playChime(context: AudioContext) {
  if (context.state !== 'running') return;
  [660, 880, 990].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + index * 0.23;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.16, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(start + 0.32);
  });
}

// Escopado pela conta, limitado e sem credenciais ou coordenadas no armazenamento.
function claimArrival(key: string, deliveryId: string): boolean {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    const entries = (Array.isArray(stored) ? stored : []).filter(
      (item): item is [string, number] =>
        Array.isArray(item) &&
        typeof item[0] === 'string' &&
        typeof item[1] === 'number' &&
        Date.now() - item[1] < 7 * 86_400_000,
    );
    if (entries.some(([id]) => id === deliveryId)) return false;
    localStorage.setItem(key, JSON.stringify([...entries.slice(-199), [deliveryId, Date.now()]]));
  } catch {
    /* Memoria ainda protege esta aba quando o armazenamento esta indisponivel. */
  }
  return true;
}

export function PickupArrivalAlerts({ token, userId }: { token: string | null; userId: string }) {
  const audio = useRef<AudioContext | null>(null);
  const soundRequested = useRef(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [showSoundPrompt, setShowSoundPrompt] = useState(false);
  const preferenceKey = `motoboycity.pickup-arrival-sound.v1:${userId}`;
  const [soundError, setSoundError] = useState(false);
  const [arrivals, setArrivals] = useState<PickupArrivalEvent[]>([]);

  const activateAudio = useCallback(async (test = false) => {
    try {
      let context = audio.current;
      if (!context) {
        const created = new AudioContext();
        created.addEventListener('statechange', () => {
          if (audio.current === created) setAudioReady(created.state === 'running');
        });
        audio.current = created;
        context = created;
      }
      await context.resume();
      if (audio.current !== context || !soundRequested.current) return;
      setAudioReady(context.state === 'running');
      if (test) playChime(context);
    } catch {
      // Autoplay bloqueado nao e falha operacional nem precisa de banner.
      if (test && soundRequested.current) setSoundError(true);
    }
  }, []);

  useEffect(() => {
    if (!token || !userId) return;
    let active = true;
    const restorePreference = (saved: string | null) => {
      const enabled = saved === 'enabled';
      soundRequested.current = enabled;
      setSoundEnabled(enabled);
      setShowSoundPrompt(saved !== 'enabled' && saved !== 'disabled');
      if (enabled) void activateAudio();
      else if (audio.current) void audio.current.suspend().catch(() => undefined);
    };
    // Leitura apos a hidratacao, sem depender de storage disponivel no SSR.
    queueMicrotask(() => {
      if (!active) return;
      let saved = null;
      try {
        saved = localStorage.getItem(preferenceKey);
      } catch {
        /* Pergunta nesta aba. */
      }
      restorePreference(saved);
    });
    const onPreferenceChanged = (event: StorageEvent) => {
      if (event.key === preferenceKey || event.key === null) restorePreference(event.newValue);
    };
    const unlock = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('[data-arrival-sound]')) return;
      if (soundRequested.current && audio.current?.state !== 'running') void activateAudio();
    };
    // Preferencia salva nao substitui a permissao de autoplay do navegador.
    window.addEventListener('storage', onPreferenceChanged);
    document.addEventListener('click', unlock, true);
    document.addEventListener('touchend', unlock, true);
    document.addEventListener('keydown', unlock, true);
    return () => {
      active = false;
      window.removeEventListener('storage', onPreferenceChanged);
      document.removeEventListener('click', unlock, true);
      document.removeEventListener('touchend', unlock, true);
      document.removeEventListener('keydown', unlock, true);
      const context = audio.current;
      audio.current = null;
      if (context) void context.close().catch(() => undefined);
    };
  }, [token, userId, preferenceKey, activateAudio]);

  useEffect(() => {
    if (!token || !userId) return;
    let active = true;
    const seen = new Set<string>();
    const key = `motoboycity.pickup-arrivals.v1:${userId}`;
    const socket = io(apiBaseUrl, { auth: { token } });
    const onArrival = (raw: unknown) => {
      const parsed = pickupArrivalEventSchema.safeParse(raw);
      if (!parsed.success) return;
      const event = parsed.data;
      const age = Date.now() - Date.parse(event.arrivedAt);
      if (age > 60_000 || age < -5_000 || seen.has(event.deliveryId)) return;
      seen.add(event.deliveryId);
      if (seen.size > 500) seen.delete(seen.values().next().value!);
      if (!active) return;
      setArrivals((items) =>
        [...items.filter((item) => item.deliveryId !== event.deliveryId), event].slice(-5),
      );
      const display = () => {
        if (!active) return;
        // Uma aba sem som nao pode consumir o aviso sonoro de outra aba habilitada.
        if (
          soundRequested.current &&
          audio.current?.state === 'running' &&
          claimArrival(key, event.deliveryId)
        ) {
          try {
            playChime(audio.current);
          } catch {
            setSoundError(true);
          }
        }
      };
      // Evita dois sons em abas simultaneas do mesmo navegador, quando suportado.
      if (navigator.locks) void navigator.locks.request(key, display).catch(() => undefined);
      else display();
    };
    socket.on('delivery:pickup-arrival', onArrival);
    const onUpdated = (raw: unknown) => {
      if (!raw || typeof raw !== 'object') return;
      const update = raw as { deliveryId?: unknown; id?: unknown; status?: unknown };
      const id = update.deliveryId ?? update.id;
      if (
        typeof id === 'string' &&
        typeof update.status === 'string' &&
        update.status !== 'ACCEPTED'
      ) {
        setArrivals((items) => items.filter((item) => item.deliveryId !== id));
      }
    };
    socket.on('delivery:updated', onUpdated);
    const expiry = window.setInterval(() => {
      setArrivals((items) => {
        const current = items.filter((item) => Date.now() - Date.parse(item.arrivedAt) < 120_000);
        return current.length === items.length ? items : current;
      });
    }, 15_000);
    return () => {
      active = false;
      window.clearInterval(expiry);
      socket.off('delivery:pickup-arrival', onArrival);
      socket.off('delivery:updated', onUpdated);
      socket.disconnect();
    };
  }, [token, userId]);

  async function chooseSound(enabled: boolean) {
    setSoundError(false);
    soundRequested.current = enabled;
    setSoundEnabled(enabled);
    setShowSoundPrompt(false);
    try {
      localStorage.setItem(preferenceKey, enabled ? 'enabled' : 'disabled');
    } catch {
      /* A escolha ainda vale nesta aba quando storage esta bloqueado. */
    }
    try {
      if (!enabled) {
        if (audio.current) await audio.current.suspend();
        return;
      }
      await activateAudio(true);
    } catch {
      setSoundError(true);
    }
  }

  if (!token || !userId) return null;
  const label = soundEnabled ? 'Desativar som de chegada' : 'Ativar e testar som de chegada';
  return (
    <>
      <button
        type="button"
        data-arrival-sound
        aria-label={label}
        title={
          soundEnabled && !audioReady
            ? 'Som ativado. Clique no painel para liberar o áudio do navegador.'
            : label
        }
        aria-pressed={soundEnabled}
        onClick={() => void chooseSound(!soundRequested.current)}
        className={`inline-flex size-9 shrink-0 items-center justify-center rounded-xl border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-colete ${soundEnabled ? 'border-emerald-300/40 bg-emerald-300/15 text-emerald-200' : 'border-white/20 text-white/70 hover:bg-white/10'}`}
      >
        {soundEnabled ? (
          <Volume2 className="size-4" aria-hidden />
        ) : (
          <VolumeX className="size-4" aria-hidden />
        )}
      </button>
      <Dialog
        open={showSoundPrompt}
        onOpenChange={(open) => {
          if (!open) void chooseSound(false);
        }}
      >
        <DialogContent data-arrival-sound>
          <DialogHeader>
            <span className="mb-3 inline-flex rounded-2xl bg-portal/10 p-3 text-portal">
              <Volume2 className="size-6" aria-hidden />
            </span>
            <DialogTitle>Ouça quando o motoboy chegar</DialogTitle>
            <DialogDescription>
              Ative um aviso sonoro quando o GPS indicar que o motoboy está próximo da loja
              para coletar o pedido.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3 text-sm text-muted-foreground">
            <p>
              Ao ativar, você ouvirá um toque de teste. Mantenha o painel aberto e o volume
              do aparelho ligado.
            </p>
            <p>
              Sua escolha será lembrada neste navegador. Você pode mudar a qualquer
              momento pelo ícone de volume no topo.
            </p>
          </DialogBody>
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => void chooseSound(false)}>
              Continuar sem som
            </Button>
            <Button onClick={() => void chooseSound(true)}>Ativar e testar som</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div
        className="fixed top-32 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 text-asfalto lg:top-20"
        aria-live="polite"
        aria-atomic="false"
      >
        {soundError && (
          <div role="status" className="rounded-xl border bg-white p-4 text-sm shadow-lg">
            Não foi possível ativar o som. Os avisos visuais continuam funcionando.
            <button
              type="button"
              onClick={() => setSoundError(false)}
              aria-label="Fechar aviso de som"
              className="ml-2 rounded p-1"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        {arrivals.map((event) => (
          <div
            key={event.deliveryId}
            role="status"
            className="rounded-2xl border border-teal-200 bg-white p-4 shadow-[0_12px_40px_-12px_rgba(0,50,55,0.35)]"
          >
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-teal-50 p-2 text-teal-700">
                <Bike className="size-6" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">Motoboy próximo da loja</p>
                <p className="mt-1 text-sm text-slate-600">
                  Pedido #{event.displayNumber} · Confira a chegada para entregar o pedido.
                </p>
                <Link
                  href={`/pedidos/${event.deliveryId}`}
                  className="mt-3 inline-block rounded text-sm font-semibold text-teal-800 underline underline-offset-4"
                >
                  Ver pedido
                </Link>
              </div>
              <button
                type="button"
                aria-label={`Fechar aviso do pedido ${event.displayNumber}`}
                onClick={() =>
                  setArrivals((items) =>
                    items.filter((item) => item.deliveryId !== event.deliveryId),
                  )
                }
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
