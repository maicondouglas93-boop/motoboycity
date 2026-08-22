'use client';

import { useEffect, useRef, useState } from 'react';
import type { CompanyAddressItem, OperationalDeliveryItem } from '@motoboycity/types';
import { statusHex } from '@/components/orders/status-chip';
import { loadGoogleMaps, onGoogleMapsAuthFailure } from '@/lib/google-maps';

interface Props {
  pickupAddress: CompanyAddressItem;
  deliveries: OperationalDeliveryItem[];
  selectedId: string | null;
  onSelect: (deliveryId: string) => void;
}

export function CompanyOperationsMap({ pickupAddress, deliveries, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [ready, setReady] = useState(false);
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
          center: { lat: -20.153, lng: -41.622 },
          zoom: 13,
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
    if (!ready || !mapRef.current || !window.google) return;
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];
    const bounds = new google.maps.LatLngBounds();
    const addMarker = (
      position: google.maps.LatLngLiteral,
      title: string,
      color: string,
      onClick?: () => void,
      scale = 8,
    ) => {
      const marker = new google.maps.Marker({
        map: mapRef.current,
        position,
        title,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale,
        },
      });
      if (onClick) marker.addListener('click', onClick);
      markersRef.current.push(marker);
      bounds.extend(position);
    };

    if (pickupAddress.lat !== null && pickupAddress.lng !== null) {
      addMarker(
        { lat: pickupAddress.lat, lng: pickupAddress.lng },
        'Ponto de coleta',
        '#111827',
        undefined,
        10,
      );
    }
    for (const delivery of deliveries) {
      const dropoff = delivery.addresses.find(
        (address) => address.type === 'DROPOFF' && address.lat !== null && address.lng !== null,
      );
      if (
        dropoff?.lat !== null &&
        dropoff?.lng !== null &&
        dropoff?.lat !== undefined &&
        dropoff?.lng !== undefined
      ) {
        addMarker(
          { lat: dropoff.lat, lng: dropoff.lng },
          `Pedido #${delivery.displayNumber}`,
          statusHex(delivery.status),
          () => onSelect(delivery.id),
          selectedId === delivery.id ? 11 : 8,
        );
      }
      if (delivery.lastLocation) {
        addMarker(
          { lat: delivery.lastLocation.lat, lng: delivery.lastLocation.lng },
          delivery.driver ? `Motoboy: ${delivery.driver.name}` : 'Posição do motoboy',
          '#22c55e',
          () => onSelect(delivery.id),
          7,
        );
      }
    }
    if (!bounds.isEmpty()) mapRef.current.fitBounds(bounds, 64);
  }, [deliveries, onSelect, pickupAddress.lat, pickupAddress.lng, ready, selectedId]);

  return (
    <div className="relative h-full min-h-[480px] overflow-hidden rounded-2xl border bg-muted">
      <div ref={containerRef} className="absolute inset-0" />
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-muted p-6 text-center text-sm text-muted-foreground">
          {error}
        </div>
      )}
      <div className="absolute top-3 left-3 rounded-lg border bg-background/95 px-3 py-2 text-xs shadow-sm backdrop-blur">
        <span className="font-semibold">Mapa operacional</span> · {deliveries.length} pedidos
      </div>
    </div>
  );
}
