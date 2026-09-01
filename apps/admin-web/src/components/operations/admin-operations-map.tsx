'use client';

import { useEffect, useRef, useState } from 'react';
import type { AdminOperationsResult } from '@motoboycity/types';
import { statusHex } from '@/components/orders/status-chip';
import { loadGoogleMaps, onGoogleMapsAuthFailure } from '@/lib/google-maps';
import { retratoDoMotoboy } from '@/lib/marcador-de-motoboy';
import { LAJINHA_CENTER } from '@/lib/operation-area';

export type MapMode = 'orders' | 'drivers' | 'all';
export type AdminMapSelection = { kind: 'delivery' | 'driver'; id: string } | null;

/**
 * Enquadramento inicial na escala da cidade.
 *
 * A operacao inteira cabe em Lajinha, entao abrir a regiao toda desperdicava a
 * tela mostrando mata e municipios vizinhos onde nunca ha entrega.
 */
const DEFAULT_ZOOM = 15;

/**
 * Teto para o enquadramento automatico.
 *
 * Duas entregas muito proximas produzem bordas quase nulas, e o Google
 * responderia com o zoom maximo. O teto mantem o quarteirao em volta visivel,
 * que e o que diz ao operador onde aquilo fica.
 */
/** Verde da placa: a mesma cor que o motoboy ja tinha no mapa. */
const COR_DO_MOTOBOY = '#0b6e4f';

const MAX_AUTO_ZOOM = 16;

interface Props {
  data: AdminOperationsResult | undefined;
  mode: MapMode;
  viewportKey: string;
  selection: AdminMapSelection;
  onSelect: (selection: NonNullable<AdminMapSelection>) => void;
}

interface ManagedMarker {
  marker: google.maps.Marker;
  clickListener: google.maps.MapsEventListener;
  appearanceKey: string;
  portraitRequestKey?: string;
}

function updatePosition(
  marker: google.maps.Marker,
  position: google.maps.LatLngLiteral,
): void {
  const current = marker.getPosition();
  if (!current || current.lat() !== position.lat || current.lng() !== position.lng) {
    marker.setPosition(position);
  }
}

export function AdminOperationsMap({ data, mode, viewportKey, selection, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef(new Map<string, ManagedMarker>());
  const viewportRef = useRef({ key: '', framed: false });
  const viewportIdleListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);
  // O painel do admin olha a operacao inteira, entao o centro e sempre a cidade.
  const initialCenterRef = useRef(LAJINHA_CENTER);
  const [error, setError] = useState<string | null>(null);

  // Chave recusada nao passa pelo `catch` do carregamento: o script carrega e a
  // promise resolve, so as chamadas seguintes sao negadas. Sem isto o mapa
  // ficaria em branco sem dizer por que.
  useEffect(() => onGoogleMapsAuthFailure(setError), []);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let cancelled = false;
    const markerRegistry = markersRef.current;
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new maps.maps.Map(containerRef.current, {
          center: initialCenterRef.current,
          zoom: DEFAULT_ZOOM,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        setReady(true);
      })
      .catch((loadError: unknown) =>
        setError(loadError instanceof Error ? loadError.message : 'Mapa indisponível.'),
      );
    return () => {
      cancelled = true;
      if (viewportIdleListenerRef.current) {
        google.maps.event.removeListener(viewportIdleListenerRef.current);
        viewportIdleListenerRef.current = null;
      }
      for (const managed of markerRegistry.values()) {
        managed.clickListener.remove();
        managed.marker.setMap(null);
      }
      markerRegistry.clear();
    };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || !data) return;
    const bounds = new google.maps.LatLngBounds();
    const desiredKeys = new Set<string>();
    const upsertMarker = (
      key: string,
      position: google.maps.LatLngLiteral,
      title: string,
      zIndex: number,
      icon: google.maps.Icon | google.maps.Symbol,
      appearanceKey: string,
      click: () => void,
      preserveExistingAppearance = false,
    ) => {
      desiredKeys.add(key);
      bounds.extend(position);
      const existing = markersRef.current.get(key);
      if (existing) {
        updatePosition(existing.marker, position);
        existing.marker.setTitle(title);
        existing.marker.setZIndex(zIndex);
        if (!preserveExistingAppearance && existing.appearanceKey !== appearanceKey) {
          existing.marker.setIcon(icon);
          existing.appearanceKey = appearanceKey;
        }
        return existing;
      }

      const item = new google.maps.Marker({
        map: mapRef.current,
        position,
        title,
        zIndex,
        icon,
      });
      const managed: ManagedMarker = {
        marker: item,
        clickListener: item.addListener('click', click),
        appearanceKey,
      };
      markersRef.current.set(key, managed);
      return managed;
    };

    if (mode !== 'drivers') {
      for (const delivery of [...data.active, ...data.recent]) {
        const dropoff = delivery.addresses.find(
          (address) => address.type === 'DROPOFF' && address.lat !== null && address.lng !== null,
        );
        const location =
          dropoff?.lat !== null &&
          dropoff?.lng !== null &&
          dropoff?.lat !== undefined &&
          dropoff?.lng !== undefined
            ? { lat: dropoff.lat, lng: dropoff.lng }
            : delivery.lastLocation
              ? { lat: delivery.lastLocation.lat, lng: delivery.lastLocation.lng }
              : null;
        if (!location) continue;
        const selected = selection?.kind === 'delivery' && selection.id === delivery.id;
        const color = statusHex(delivery.status);
        upsertMarker(
          `delivery:${delivery.id}`,
          location,
          `#${delivery.displayNumber} · ${delivery.companyName}`,
          selected ? 100 : 1,
          {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: selected ? 3 : 2,
            scale: selected ? 11 : 8,
          },
          `delivery:${color}:${selected}`,
          () => onSelectRef.current({ kind: 'delivery', id: delivery.id }),
        );
      }
    }
    if (mode !== 'orders') {
      for (const driver of data.onlineDrivers) {
        const selecionado = selection?.kind === 'driver' && selection.id === driver.id;
        const key = `driver:${driver.id}`;
        // Copias locais mantem os dados da consulta imutaveis enquanto a API
        // imperativa do Google atualiza a instancia persistente do marcador.
        const driverName = `${driver.name}`;
        const driverAvatarUrl = driver.avatarUrl ? `${driver.avatarUrl}` : null;
        const portraitRequestKey = `${driverName}|${driverAvatarUrl ?? ''}|${selecionado}`;
        const managed = upsertMarker(
          key,
          { lat: driver.location.lat, lng: driver.location.lng },
          driverName,
          selecionado ? 100 : 1,
          {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: COR_DO_MOTOBOY,
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: selecionado ? 3 : 2,
            scale: selecionado ? 11 : 8,
          },
          `driver-fallback:${portraitRequestKey}`,
          () => onSelectRef.current({ kind: 'driver', id: driver.id }),
          true,
        );
        /*
          O ponto colorido aparece primeiro e o retrato substitui quando fica
          pronto. Esperar o retrato para so entao criar o marcador deixaria o
          mapa vazio enquanto as fotos carregam.
        */
        if (managed.portraitRequestKey !== portraitRequestKey) {
          managed.portraitRequestKey = portraitRequestKey;
          void retratoDoMotoboy({
            nome: driverName,
            avatarUrl: driverAvatarUrl,
            cor: COR_DO_MOTOBOY,
            selecionado,
          }).then((retrato) => {
            const current = markersRef.current.get(key);
            if (current !== managed || current.portraitRequestKey !== portraitRequestKey || !retrato) {
              return;
            }
            const lado = selecionado ? 44 : 34;
            current.marker.setIcon({
              url: retrato,
              scaledSize: new google.maps.Size(lado, lado),
              anchor: new google.maps.Point(lado / 2, lado / 2),
            });
            current.appearanceKey = `driver-portrait:${portraitRequestKey}`;
          });
        }
      }
    }

    for (const [key, managed] of markersRef.current) {
      if (desiredKeys.has(key)) continue;
      managed.clickListener.remove();
      managed.marker.setMap(null);
      markersRef.current.delete(key);
    }
    /**
     * Atualizacoes de localizacao movem o marcador existente e nao podem tomar
     * o controle da camera. A camera so e reenquadrada na primeira carga ou
     * quando o operador muda modo/filtros (`viewportKey`).
     */
    const map = mapRef.current;
    if (viewportRef.current.key !== viewportKey) {
      viewportRef.current = { key: viewportKey, framed: false };
    }
    if (!viewportRef.current.framed && markersRef.current.size > 0) {
      viewportRef.current.framed = true;
      if (viewportIdleListenerRef.current) {
        google.maps.event.removeListener(viewportIdleListenerRef.current);
        viewportIdleListenerRef.current = null;
      }
      if (markersRef.current.size === 1) {
        const onlyMarker = markersRef.current.values().next().value as ManagedMarker;
        map.setCenter(onlyMarker.marker.getPosition()!);
      } else {
        viewportIdleListenerRef.current = google.maps.event.addListenerOnce(map, 'idle', () => {
          viewportIdleListenerRef.current = null;
          const zoom = map.getZoom();
          if (zoom !== undefined && zoom > MAX_AUTO_ZOOM) map.setZoom(MAX_AUTO_ZOOM);
        });
        map.fitBounds(bounds, 64);
      }
    }

  }, [data, mode, ready, selection, viewportKey]);

  return (
    <div className="premium-panel relative h-full min-h-[600px] w-full min-w-0 max-w-full overflow-hidden rounded-2xl border bg-muted ring-1 ring-white/80">
      <div ref={containerRef} className="absolute inset-0" />
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-muted p-8 text-center text-sm text-muted-foreground">
          {error}
        </div>
      )}
      <div className="absolute top-3 left-3 rounded-xl border border-primary/15 bg-card/90 px-3 py-2 text-xs shadow-lg ring-1 ring-white/70 backdrop-blur-xl">
        <strong>{data?.active.length ?? 0}</strong> ativos ·{' '}
        <strong>{data?.onlineDrivers.length ?? 0}</strong> motoboys online
      </div>
    </div>
  );
}
