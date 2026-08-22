'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { loadGoogleMaps, onGoogleMapsAuthFailure } from '@/lib/google-maps';

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

  /**
   * Chave recusada nao passa pelo `catch` do carregamento: o script carrega,
   * a promise resolve, e so as chamadas seguintes sao negadas. Sem esta
   * inscricao, digitar um endereco simplesmente nao traria sugestao nenhuma e
   * a tela nao diria por que.
   */
  useEffect(() => onGoogleMapsAuthFailure(setError), []);

  useEffect(() => {
    let listener: google.maps.MapsEventListener | null = null;
    let cancelled = false;
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !inputRef.current) return;
        const autocomplete = new maps.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: 'br' },
          fields: ['address_components', 'formatted_address', 'geometry'],
          types: ['address'],
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
      .catch((loadError: unknown) =>
        setError(loadError instanceof Error ? loadError.message : 'Mapa indisponível.'),
      );
    return () => {
      cancelled = true;
      if (listener) listener.remove();
    };
  }, []);

  return (
    <div className="space-y-1">
      <Input
        ref={inputRef}
        value={value}
        placeholder="Comece a digitar e selecione uma sugestão"
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
