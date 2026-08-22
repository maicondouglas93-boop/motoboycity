'use client';

import { useEffect, useRef, useState } from 'react';
import type { DeliveryAddressItem, DeliveryTrackingPoint } from '@motoboycity/types';
import { loadGoogleMaps, onGoogleMapsAuthFailure } from '@/lib/google-maps';

export function OrderDetailMap({
  addresses,
  points,
}: {
  addresses: DeliveryAddressItem[];
  points: DeliveryTrackingPoint[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
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
        const located = addresses.filter((item) => item.lat !== null && item.lng !== null);
        const center =
          located[0]?.lat !== null && located[0]?.lng !== null && located[0]
            ? { lat: located[0].lat!, lng: located[0].lng! }
            : points[0]
              ? { lat: points[0].lat, lng: points[0].lng }
              : { lat: -20.153, lng: -41.622 };
        const map = new maps.maps.Map(containerRef.current, {
          center,
          zoom: 14,
          mapTypeControl: false,
          streetViewControl: false,
        });
        const bounds = new maps.maps.LatLngBounds();
        located.forEach((address) => {
          const position = { lat: address.lat!, lng: address.lng! };
          new maps.maps.Marker({
            map,
            position,
            title: address.type === 'PICKUP' ? 'Coleta' : 'Destino',
          });
          bounds.extend(position);
        });
        if (points.length) {
          const path = points.map((point) => ({ lat: point.lat, lng: point.lng })).reverse();
          new maps.maps.Polyline({
            map,
            path,
            strokeColor: '#2563eb',
            strokeOpacity: 0.8,
            strokeWeight: 4,
          });
          path.forEach((position) => bounds.extend(position));
          const last = points[0]!;
          new maps.maps.Marker({
            map,
            position: { lat: last.lat, lng: last.lng },
            title: 'Última posição',
          });
        }
        if (!bounds.isEmpty()) map.fitBounds(bounds, 48);
      })
      .catch((loadError: unknown) =>
        setError(loadError instanceof Error ? loadError.message : 'Mapa indisponível.'),
      );
    return () => {
      cancelled = true;
    };
  }, [addresses, points]);
  return (
    <div className="relative h-80 overflow-hidden rounded-xl border bg-muted">
      <div ref={containerRef} className="absolute inset-0" />
      {error && (
        <div className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-muted-foreground">
          {error}
        </div>
      )}
    </div>
  );
}
