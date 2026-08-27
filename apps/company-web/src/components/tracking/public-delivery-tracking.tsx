'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { ApiError } from '@motoboycity/api-client';
import type {
  PublicDeliveryTracking,
  PublicDeliveryTrackingLocation,
  PublicDeliveryTrackingStatus,
} from '@motoboycity/types';
import { Bike, CheckCircle2, Clock3, MapPin, Radio, Wifi, WifiOff, XCircle } from 'lucide-react';
import { apiBaseUrl, trackingApi } from '@/lib/api-client';
import {
  applyPublicTrackingLocation,
  applyPublicTrackingUpdate,
  isPublicTrackingTerminal,
} from '@/lib/public-delivery-tracking';
import { PublicTrackingMap } from './public-tracking-map';

type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline';

const STATUS_CONTENT: Record<PublicDeliveryTrackingStatus, { title: string; description: string }> =
  {
    WAITING_DRIVER: {
      title: 'Procurando entregador',
      description: 'Assim que um motoboy aceitar, o acompanhamento sera atualizado aqui.',
    },
    DRIVER_ASSIGNED: {
      title: 'Entregador a caminho',
      description: 'O motoboy ja assumiu a entrega.',
    },
    IN_TRANSIT: {
      title: 'Entrega em andamento',
      description: 'A posicao abaixo e atualizada automaticamente.',
    },
    COMPLETED: {
      title: 'Entrega concluida',
      description: 'O compartilhamento da localizacao foi encerrado.',
    },
    CANCELLED: {
      title: 'Entrega encerrada',
      description: 'O compartilhamento da localizacao foi encerrado.',
    },
  };

function StatusIcon({ status }: { status: PublicDeliveryTrackingStatus }) {
  const className = 'size-7';
  if (status === 'COMPLETED') return <CheckCircle2 className={className} />;
  if (status === 'CANCELLED') return <XCircle className={className} />;
  if (status === 'WAITING_DRIVER') return <Radio className={className} />;
  return <Bike className={className} />;
}

function errorMessage(error: unknown): { title: string; description: string } {
  if (error instanceof ApiError && error.status === 410) {
    return {
      title: 'Link expirado',
      description: 'A entrega foi encerrada e a localizacao nao esta mais disponivel.',
    };
  }
  if (error instanceof ApiError && (error.status === 400 || error.status === 404)) {
    return {
      title: 'Link invalido',
      description: 'Confira se o link recebido esta completo ou solicite um novo a empresa.',
    };
  }
  return {
    title: 'Rastreamento indisponivel',
    description: 'Nao foi possivel carregar a entrega. Verifique sua internet e tente novamente.',
  };
}

export function PublicDeliveryTrackingView({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const query = useQuery({
    queryKey: ['public-tracking', token],
    queryFn: () => trackingApi.publicDetail(token),
    retry: (failureCount, error) =>
      !(error instanceof ApiError && [400, 404, 410].includes(error.status)) && failureCount < 2,
    refetchInterval: (state) => {
      const status = state.state.data?.status;
      return status && !isPublicTrackingTerminal(status) ? 30_000 : false;
    },
  });
  const trackingStatus = query.data?.status;
  const trackingExpired = query.error instanceof ApiError && query.error.status === 410;

  useEffect(() => {
    if (!trackingStatus || trackingExpired || isPublicTrackingTerminal(trackingStatus)) return;
    const socket = io(apiBaseUrl, { auth: { publicTrackingToken: token } });
    socket.on('connect', () => setConnection('connected'));
    socket.io.on('reconnect_attempt', () => setConnection('reconnecting'));
    socket.on('connect_error', () => setConnection('offline'));
    socket.on('disconnect', (reason) => {
      if (reason !== 'io client disconnect') setConnection('offline');
    });
    socket.on('public-tracking:location', (location: PublicDeliveryTrackingLocation) => {
      queryClient.setQueryData<PublicDeliveryTracking>(['public-tracking', token], (current) =>
        applyPublicTrackingLocation(current, location),
      );
    });
    socket.on('public-tracking:updated', (update: PublicDeliveryTracking) => {
      queryClient.setQueryData<PublicDeliveryTracking>(['public-tracking', token], (current) =>
        applyPublicTrackingUpdate(current, update),
      );
      if (isPublicTrackingTerminal(update.status)) socket.disconnect();
    });
    return () => {
      socket.disconnect();
    };
  }, [queryClient, token, trackingExpired, trackingStatus]);

  const content = query.data ? STATUS_CONTENT[query.data.status] : null;
  const failure = query.isError ? errorMessage(query.error) : null;

  return (
    <main className="company-workspace min-h-screen px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-lg space-y-5">
        <header className="flex items-center justify-between gap-4 rounded-2xl bg-[#0b2c36] px-4 py-3 shadow-lg shadow-[#0b2c36]/15">
          <Image
            src="/brand/motoboycity-logo.png"
            alt="MOTOboyCity"
            width={150}
            height={45}
            priority
            className="h-auto w-36"
          />
          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-semibold tracking-[0.1em] text-white/80 uppercase">
            Rastreamento
          </span>
        </header>

        {query.isLoading && (
          <section className="premium-panel rounded-3xl bg-white p-6 text-center">
            <Radio className="mx-auto size-8 animate-pulse text-portal" />
            <h1 className="mt-4 text-xl font-bold text-portal-deep">Carregando entrega...</h1>
          </section>
        )}

        {failure && (
          <section className="premium-panel rounded-3xl bg-white p-6 text-center">
            <XCircle className="mx-auto size-10 text-destructive" />
            <h1 className="mt-4 text-xl font-bold text-portal-deep">{failure.title}</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{failure.description}</p>
            {!((query.error as ApiError | undefined)?.status === 410) && (
              <button
                type="button"
                onClick={() => void query.refetch()}
                className="mt-5 rounded-xl bg-portal px-4 py-2 text-sm font-semibold text-white"
              >
                Tentar novamente
              </button>
            )}
          </section>
        )}

        {!query.isError && query.data && content && (
          <>
            <section className="premium-panel overflow-hidden rounded-3xl bg-white">
              <div className="h-1 bg-gradient-to-r from-portal via-[#35b8b2] to-colete" />
              <div className="p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-portal-soft text-portal">
                    <StatusIcon status={query.data.status} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold tracking-[0.12em] text-portal uppercase">
                      Situacao da entrega
                    </p>
                    <h1 className="mt-1 text-2xl font-bold text-portal-deep">{content.title}</h1>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {content.description}
                    </p>
                  </div>
                </div>

                {!isPublicTrackingTerminal(query.data.status) && (
                  <div className="mt-5 flex items-center gap-2 border-t border-portal/10 pt-4 text-xs text-muted-foreground">
                    {connection === 'connected' ? (
                      <Wifi className="size-4 text-placa" />
                    ) : (
                      <WifiOff className="size-4 text-colete-escuro" />
                    )}
                    {connection === 'connected'
                      ? 'Atualizacao em tempo real conectada'
                      : connection === 'reconnecting'
                        ? 'Reconectando...'
                        : connection === 'offline'
                          ? 'Sem conexao em tempo real. Tentando novamente...'
                          : 'Conectando atualizacoes...'}
                  </div>
                )}
              </div>
            </section>

            {query.data.location ? (
              <>
                <PublicTrackingMap location={query.data.location} />
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-portal/10 bg-white/85 px-4 py-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <MapPin className="size-4 text-portal" /> Posicao mais recente
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock3 className="size-3.5" />
                    {new Intl.DateTimeFormat('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(new Date(query.data.location.capturedAt))}
                  </span>
                </div>
              </>
            ) : (
              !isPublicTrackingTerminal(query.data.status) && (
                <section className="rounded-3xl border border-dashed border-portal/25 bg-white/70 p-8 text-center">
                  <MapPin className="mx-auto size-8 text-portal/50" />
                  <p className="mt-3 text-sm font-medium text-portal-deep">
                    Aguardando a primeira posicao do entregador.
                  </p>
                </section>
              )
            )}
          </>
        )}
      </div>
    </main>
  );
}
