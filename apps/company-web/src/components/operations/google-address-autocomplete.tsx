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

  /**
   * Chave recusada nao passa pelo `catch` do carregamento: o script carrega,
   * a promise resolve, e so as chamadas seguintes sao negadas. Sem esta
   * inscricao, digitar um endereco simplesmente nao traria sugestao nenhuma e
   * a tela nao diria por que.
   */
  useEffect(() => onGoogleMapsAuthFailure(setError), []);

  /**
   * Mantem a lista de sugestoes colada no campo.
   *
   * O Google prende o `.pac-container` no `body` e o posiciona em coordenadas
   * do documento, calculadas uma vez, quando a lista abre. So que este
   * formulario vive num painel com rolagem propria: rolar o painel move o
   * campo e deixa a lista para tras. Medido na central: 157px de
   * desalinhamento, exatamente a altura rolavel do painel.
   *
   * A saida e trocar para `position: fixed` e sincronizar com o retangulo do
   * campo na viewport, que e o mesmo referencial. O `true` no listener e o que
   * faz isso funcionar: sem a fase de captura, a rolagem de um ancestral nao
   * chega aqui.
   *
   * A lista aberta e sempre a do campo em foco — so uma abre por vez — entao
   * nao e preciso associar container a input, o que o Google nao permite de
   * qualquer forma.
   */
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
        /**
         * Puxa as sugestoes para Lajinha.
         *
         * So com `country: 'br'`, digitar "aven" trazia avenidas do Rio, de
         * Recife e de Campo Grande antes de qualquer coisa daqui — o Google
         * ordena por relevancia global, e a cidade com mais gente ganha sempre.
         *
         * O circulo e convertido em bordas porque e isso que a Autocomplete
         * aceita como referencia de lugar.
         */
        const bias = new maps.maps.Circle({
          center: LAJINHA_CENTER,
          radius: SUGGESTION_BIAS_RADIUS_METERS,
        }).getBounds();

        const autocomplete = new maps.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: 'br' },
          fields: ['address_components', 'formatted_address', 'geometry'],
          types: ['address'],
          ...(bias ? { bounds: bias } : {}),
          /**
           * Viés, e nao filtro: `strictBounds` continua desligado. Uma entrega
           * para a cidade vizinha e rara, mas travar o campo a impediria por
           * completo, ja que o formulario exige uma sugestao do Google para
           * submeter.
           */
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
