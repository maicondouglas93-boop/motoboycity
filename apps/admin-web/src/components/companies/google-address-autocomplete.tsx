'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { loadGoogleMaps, onGoogleMapsAuthFailure } from '@/lib/google-maps';
import { LAJINHA_CENTER, SUGGESTION_BIAS_RADIUS_METERS } from '@/lib/operation-area';

export interface SelectedGoogleAddress {
  label: string;
  street: string;
  number: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
}

interface Props {
  value: string;
  onValueChange: (value: string) => void;
  onAddressChange: (address: SelectedGoogleAddress | null) => void;
}

function component(
  components: google.maps.GeocoderAddressComponent[],
  type: string,
  short = false,
): string {
  const match = components.find((item) => item.types.includes(type));
  return match ? (short ? match.short_name : match.long_name) : '';
}

export function GoogleAddressAutocomplete({ value, onValueChange, onAddressChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const valueChangeRef = useRef(onValueChange);
  const addressChangeRef = useRef(onAddressChange);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    valueChangeRef.current = onValueChange;
    addressChangeRef.current = onAddressChange;
  }, [onAddressChange, onValueChange]);

  useEffect(() => onGoogleMapsAuthFailure(setError), []);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const sync = () => {
      if (document.activeElement !== input) return;
      const pac = Array.from(document.querySelectorAll<HTMLElement>('.pac-container')).find(
        (element) => element.children.length > 0 && element.style.display !== 'none',
      );
      if (!pac) return;
      const rect = input.getBoundingClientRect();
      pac.style.position = 'fixed';
      pac.style.left = `${rect.left}px`;
      pac.style.top = `${rect.bottom}px`;
      pac.style.width = `${rect.width}px`;
    };
    window.addEventListener('scroll', sync, true);
    window.addEventListener('resize', sync);
    return () => {
      window.removeEventListener('scroll', sync, true);
      window.removeEventListener('resize', sync);
    };
  }, []);

  useEffect(() => {
    let listener: google.maps.MapsEventListener | null = null;
    let cancelled = false;
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !inputRef.current) return;
        const bounds = new maps.maps.Circle({
          center: LAJINHA_CENTER,
          radius: SUGGESTION_BIAS_RADIUS_METERS,
        }).getBounds();
        const autocomplete = new maps.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: 'br' },
          fields: ['address_components', 'formatted_address', 'geometry'],
          types: ['address'],
          ...(bounds ? { bounds } : {}),
          strictBounds: false,
        });
        listener = autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          const location = place.geometry?.location;
          const components = place.address_components ?? [];
          if (!location || components.length === 0) {
            setError('Selecione um endereço da lista do Google.');
            addressChangeRef.current(null);
            return;
          }
          const selected: SelectedGoogleAddress = {
            label: place.formatted_address ?? inputRef.current?.value ?? '',
            street: component(components, 'route'),
            number: component(components, 'street_number'),
            city:
              component(components, 'administrative_area_level_2') ||
              component(components, 'locality') ||
              component(components, 'sublocality_level_1'),
            state: component(components, 'administrative_area_level_1', true),
            zip: component(components, 'postal_code'),
            lat: location.lat(),
            lng: location.lng(),
          };
          setError(null);
          valueChangeRef.current(selected.label);
          addressChangeRef.current(selected);
        });
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Mapa indisponível.'),
      );
    return () => {
      cancelled = true;
      listener?.remove();
    };
  }, []);

  return (
    <div className="space-y-1">
      <Input
        ref={inputRef}
        value={value}
        placeholder="Digite e selecione uma sugestão do Google"
        autoComplete="off"
        onChange={(event) => {
          onValueChange(event.target.value);
          onAddressChange(null);
        }}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
