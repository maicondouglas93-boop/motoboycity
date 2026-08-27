'use client';

import { useEffect, useRef, useState } from 'react';
import type { PublicDeliveryTrackingLocation } from '@motoboycity/types';
import { loadGoogleMaps, onGoogleMapsAuthFailure } from '@/lib/google-maps';

const MOTORCYCLE_MARKER_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="72" viewBox="0 0 64 72">
    <defs>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="180%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#0b2c36" flood-opacity="0.35"/>
      </filter>
    </defs>
    <g filter="url(#shadow)">
      <path d="M32 69 23 54h18L32 69Z" fill="#0f6b70"/>
      <circle cx="32" cy="30" r="27" fill="#0f6b70" stroke="#ffffff" stroke-width="4"/>
      <text x="32" y="40" text-anchor="middle" font-size="30" font-family="Segoe UI Emoji, Apple Color Emoji, sans-serif">&#x1F3CD;&#xFE0F;</text>
    </g>
  </svg>
`)}`;

export function createPublicTrackingMotorcycleMarkerIcon(maps: typeof google): google.maps.Icon {
  return {
    url: MOTORCYCLE_MARKER_URL,
    scaledSize: new maps.maps.Size(52, 59),
    anchor: new maps.maps.Point(26, 57),
  };
}

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
          icon: createPublicTrackingMotorcycleMarkerIcon(maps),
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
