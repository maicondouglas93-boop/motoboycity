'use client';

import { useEffect, useRef, useState } from 'react';
import type { AdminOperationsResult } from '@motoboycity/types';
import { statusHex } from '@/components/orders/status-chip';
import { loadGoogleMaps, onGoogleMapsAuthFailure } from '@/lib/google-maps';

export type MapMode = 'orders' | 'drivers' | 'all';
export type AdminMapSelection = { kind: 'delivery' | 'driver'; id: string } | null;

/**
 * Centro de Lajinha, obtido pelo geocoder do proprio Google e nao estimado:
 * `Lajinha, MG, 36980-000, Brasil` responde -20.15221, -41.62322.
 */
const LAJINHA_CENTER = { lat: -20.15221, lng: -41.62322 };

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
const MAX_AUTO_ZOOM = 16;

interface Props {
  data: AdminOperationsResult | undefined;
  mode: MapMode;
  selection: AdminMapSelection;
  onSelect: (selection: NonNullable<AdminMapSelection>) => void;
}

export function AdminOperationsMap({ data, mode, selection, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [ready, setReady] = useState(false);
  // O painel do admin olha a operacao inteira, entao o centro e sempre a cidade.
  const initialCenterRef = useRef(LAJINHA_CENTER);
  const [error, setError] = useState<string | null>(null);

  // Chave recusada nao passa pelo `catch` do carregamento: o script carrega e a
  // promise resolve, so as chamadas seguintes sao negadas. Sem isto o mapa
  // ficaria em branco sem dizer por que.
  useEffect(() => onGoogleMapsAuthFailure(setError), []);

  useEffect(() => {
    let cancelled = false;
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
    };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || !data) return;
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];
    const bounds = new google.maps.LatLngBounds();
    const marker = (
      position: google.maps.LatLngLiteral,
      title: string,
      color: string,
      selected: boolean,
      click: () => void,
    ) => {
      const item = new google.maps.Marker({
        map: mapRef.current,
        position,
        title,
        zIndex: selected ? 100 : 1,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: selected ? 3 : 2,
          scale: selected ? 11 : 8,
        },
      });
      item.addListener('click', click);
      markersRef.current.push(item);
      bounds.extend(position);
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
        marker(
          location,
          `#${delivery.displayNumber} · ${delivery.companyName}`,
          statusHex(delivery.status),
          selection?.kind === 'delivery' && selection.id === delivery.id,
          () => onSelect({ kind: 'delivery', id: delivery.id }),
        );
      }
    }
    if (mode !== 'orders') {
      for (const driver of data.onlineDrivers) {
        marker(
          { lat: driver.location.lat, lng: driver.location.lng },
          driver.name,
          '#22c55e',
          selection?.kind === 'driver' && selection.id === driver.id,
          () => onSelect({ kind: 'driver', id: driver.id }),
        );
      }
    }
    /**
     * Enquadrar so quando ha o que enquadrar.
     *
     * `fitBounds` com um unico marcador recebe bordas de tamanho zero e o
     * Google responde com o zoom maximo — a tela saltava da cidade para a
     * calcada de um endereco so. Com um ponto, o certo e centralizar e deixar o
     * zoom como esta, o que tambem respeita quem ja tinha ajustado a vista.
     */
    const map = mapRef.current;
    if (markersRef.current.length === 1) {
      map.setCenter(markersRef.current[0]!.getPosition()!);
    } else if (markersRef.current.length > 1) {
      google.maps.event.addListenerOnce(map, 'idle', () => {
        const zoom = map.getZoom();
        if (zoom !== undefined && zoom > MAX_AUTO_ZOOM) map.setZoom(MAX_AUTO_ZOOM);
      });
      map.fitBounds(bounds, 64);
    }
  }, [data, mode, onSelect, ready, selection]);

  return (
    <div className="relative h-full min-h-[600px] overflow-hidden rounded-2xl border bg-muted">
      <div ref={containerRef} className="absolute inset-0" />
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-muted p-8 text-center text-sm text-muted-foreground">
          {error}
        </div>
      )}
      <div className="absolute top-3 left-3 rounded-lg border bg-background/95 px-3 py-2 text-xs shadow-sm backdrop-blur">
        <strong>{data?.active.length ?? 0}</strong> ativos ·{' '}
        <strong>{data?.onlineDrivers.length ?? 0}</strong> motoboys online
      </div>
    </div>
  );
}
