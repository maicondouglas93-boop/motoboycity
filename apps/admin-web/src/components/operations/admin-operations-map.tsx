'use client';

import { useEffect, useRef, useState } from 'react';
import type { AdminOperationsResult } from '@motoboycity/types';
import { loadGoogleMaps } from '@/lib/google-maps';

export type MapMode = 'orders' | 'drivers' | 'all';
export type AdminMapSelection = { kind: 'delivery' | 'driver'; id: string } | null;

interface Props {
  data: AdminOperationsResult | undefined;
  mode: MapMode;
  selection: AdminMapSelection;
  onSelect: (selection: NonNullable<AdminMapSelection>) => void;
}

const statusColor: Record<string, string> = {
  SCHEDULED: '#7c3aed',
  AWAITING_DRIVER: '#f59e0b',
  ACCEPTED: '#2563eb',
  COLLECTED: '#0891b2',
  DELIVERED: '#db2777',
  AWAITING_PAYMENT: '#ea580c',
  COMPLETED: '#16a34a',
  CANCELLED: '#64748b',
};

export function AdminOperationsMap({ data, mode, selection, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new maps.maps.Map(containerRef.current, {
          center: { lat: -20.153, lng: -41.622 },
          zoom: 12,
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
        const location = dropoff?.lat !== null && dropoff?.lng !== null && dropoff?.lat !== undefined && dropoff?.lng !== undefined
          ? { lat: dropoff.lat, lng: dropoff.lng }
          : delivery.lastLocation
            ? { lat: delivery.lastLocation.lat, lng: delivery.lastLocation.lng }
            : null;
        if (!location) continue;
        marker(
          location,
          `#${delivery.displayNumber} · ${delivery.companyName}`,
          statusColor[delivery.status] ?? '#2563eb',
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
    if (!bounds.isEmpty()) mapRef.current.fitBounds(bounds, 64);
  }, [data, mode, onSelect, ready, selection]);

  return (
    <div className="relative h-full min-h-[600px] overflow-hidden rounded-2xl border bg-muted">
      <div ref={containerRef} className="absolute inset-0" />
      {error && <div className="absolute inset-0 grid place-items-center bg-muted p-8 text-center text-sm text-muted-foreground">{error}</div>}
      <div className="absolute top-3 left-3 rounded-lg border bg-background/95 px-3 py-2 text-xs shadow-sm backdrop-blur">
        <strong>{data?.active.length ?? 0}</strong> ativos · <strong>{data?.onlineDrivers.length ?? 0}</strong> motoboys online
      </div>
    </div>
  );
}
