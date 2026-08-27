'use client';

import { useEffect, useRef, useState } from 'react';
import type { PublicDeliveryTrackingLocation } from '@motoboycity/types';
import { loadGoogleMaps, onGoogleMapsAuthFailure } from '@/lib/google-maps';

export function PublicTrackingMap({ location }: { location: PublicDeliveryTrackingLocation }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => onGoogleMapsAuthFailure(setError), []);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        const position = { lat: location.lat, lng: location.lng };
        const map = new maps.maps.Map(containerRef.current, {
          center: position,
          zoom: 16,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        mapRef.current = map;
        markerRef.current = new maps.maps.Marker({
          map,
          position,
          title: 'Posicao atual da entrega',
        });
      })
      .catch((loadError: unknown) =>
        setError(loadError instanceof Error ? loadError.message : 'Mapa indisponivel.'),
      );
    return () => {
      cancelled = true;
      mapRef.current = null;
      markerRef.current = null;
    };
    // O mapa nasce uma vez; o efeito abaixo move o marcador sem recria-lo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const position = { lat: location.lat, lng: location.lng };
    markerRef.current?.setPosition(position);
    mapRef.current?.panTo(position);
  }, [location.lat, location.lng]);

  return (
    <div className="relative h-[22rem] overflow-hidden rounded-3xl border border-portal/20 bg-muted shadow-xl shadow-portal-deep/10">
      <div ref={containerRef} className="absolute inset-0" />
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-muted/95 p-6 text-center text-sm text-muted-foreground">
          {error}
        </div>
      )}
    </div>
  );
}
