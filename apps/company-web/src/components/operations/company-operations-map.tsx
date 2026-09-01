'use client';

import { useEffect, useRef, useState } from 'react';
import type { CompanyAddressItem, OperationalDeliveryItem } from '@motoboycity/types';
import { statusHex } from '@/components/orders/status-chip';
import { retratoDoMotoboy } from '@/lib/marcador-de-motoboy';
import { loadGoogleMaps, onGoogleMapsAuthFailure } from '@/lib/google-maps';
import { LAJINHA_CENTER } from '@/lib/operation-area';

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
  pickupAddress: CompanyAddressItem;
  deliveries: OperationalDeliveryItem[];
  selectedId: string | null;
  onSelect: (deliveryId: string) => void;
}

interface ManagedMarker {
  marker: google.maps.Marker;
  clickListener: google.maps.MapsEventListener | null;
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

/** Verde da placa: a mesma cor que o motoboy ja tinha no mapa. */
const COR_DO_MOTOBOY = '#0b6e4f';

/**
 * Identifica mudancas que realmente exigem reenquadrar a operacao.
 *
 * A posicao do motoboy fica deliberadamente fora da chave: ela muda a cada
 * evento de GPS e deve mover somente o marcador, sem desfazer o zoom ou o
 * arraste feitos pela empresa. Destinos e ponto de coleta entram com as
 * coordenadas porque uma correcao de endereco muda a area da operacao.
 */
export function operationsMapCameraScope(
  pickupAddress: Pick<CompanyAddressItem, 'lat' | 'lng'>,
  deliveries: Pick<OperationalDeliveryItem, 'id' | 'addresses' | 'lastLocation'>[],
) {
  const scope: string[] = [];

  if (pickupAddress.lat !== null && pickupAddress.lng !== null) {
    scope.push(`pickup:${pickupAddress.lat}:${pickupAddress.lng}`);
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
      scope.push(`dropoff:${delivery.id}:${dropoff.lat}:${dropoff.lng}`);
    }
    if (delivery.lastLocation) scope.push(`driver:${delivery.id}`);
  }

  return scope.sort().join('|');
}

export function CompanyOperationsMap({ pickupAddress, deliveries, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef(new Map<string, ManagedMarker>());
  const lastCameraScopeRef = useRef<string | null>(null);
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);
  /**
   * A loja e um centro melhor que o centro da cidade: as entregas saem dela, e
   * uma lanchonete na periferia veria o proprio bairro na borda do mapa.
   * Fica em ref porque so vale na montagem — recriar o mapa a cada render
   * perderia o estado de navegacao de quem esta olhando.
   */
  const initialCenterRef = useRef(
    pickupAddress.lat !== null && pickupAddress.lng !== null
      ? { lat: pickupAddress.lat, lng: pickupAddress.lng }
      : LAJINHA_CENTER,
  );
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
      for (const managed of markerRegistry.values()) {
        managed.clickListener?.remove();
        managed.marker.setMap(null);
      }
      markerRegistry.clear();
    };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || !window.google) return;
    const cameraScope = operationsMapCameraScope(
      { lat: pickupAddress.lat, lng: pickupAddress.lng },
      deliveries,
    );
    const bounds = new google.maps.LatLngBounds();
    const desiredKeys = new Set<string>();
    const upsertMarker = (
      key: string,
      position: google.maps.LatLngLiteral,
      title: string,
      icon: google.maps.Icon | google.maps.Symbol,
      appearanceKey: string,
      onClick?: () => void,
      preserveExistingAppearance = false,
    ) => {
      desiredKeys.add(key);
      bounds.extend(position);
      const existing = markersRef.current.get(key);
      if (existing) {
        updatePosition(existing.marker, position);
        existing.marker.setTitle(title);
        if (!preserveExistingAppearance && existing.appearanceKey !== appearanceKey) {
          existing.marker.setIcon(icon);
          existing.appearanceKey = appearanceKey;
        }
        return existing;
      }

      const marker = new google.maps.Marker({
        map: mapRef.current,
        position,
        title,
        icon,
      });
      const managed: ManagedMarker = {
        marker,
        clickListener: onClick ? marker.addListener('click', onClick) : null,
        appearanceKey,
      };
      markersRef.current.set(key, managed);
      return managed;
    };

    if (pickupAddress.lat !== null && pickupAddress.lng !== null) {
      upsertMarker(
        'pickup',
        { lat: pickupAddress.lat, lng: pickupAddress.lng },
        'Ponto de coleta',
        {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: '#10252f',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 10,
        },
        'pickup',
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
        const selected = selectedId === delivery.id;
        const color = statusHex(delivery.status);
        upsertMarker(
          `delivery:${delivery.id}:dropoff`,
          { lat: dropoff.lat, lng: dropoff.lng },
          `Pedido #${delivery.displayNumber}`,
          {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            scale: selected ? 11 : 8,
          },
          `delivery:${color}:${selected}`,
          () => onSelectRef.current(delivery.id),
        );
      }
      if (delivery.lastLocation) {
        const key = `delivery:${delivery.id}:driver`;
        const selected = selectedId === delivery.id;
        const portraitRequestKey = `${delivery.driver?.name ?? ''}|${delivery.driver?.avatarUrl ?? ''}|${selected}`;
        const managed = upsertMarker(
          key,
          { lat: delivery.lastLocation.lat, lng: delivery.lastLocation.lng },
          delivery.driver ? `Motoboy: ${delivery.driver.name}` : 'Posição do motoboy',
          {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: COR_DO_MOTOBOY,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            scale: 7,
          },
          `driver-fallback:${portraitRequestKey}`,
          () => onSelectRef.current(delivery.id),
          true,
        );
        /*
          A loja ve o rosto de quem esta com o pedido dela. O ponto verde
          aparece primeiro e o retrato substitui quando fica pronto — esperar a
          foto deixaria o mapa vazio enquanto ela carrega.
        */
        if (delivery.driver) {
          const motoboy = delivery.driver;
          if (managed.portraitRequestKey !== portraitRequestKey) {
            managed.portraitRequestKey = portraitRequestKey;
            void retratoDoMotoboy({
              nome: motoboy.name,
              avatarUrl: motoboy.avatarUrl,
              cor: COR_DO_MOTOBOY,
              selecionado: selected,
            }).then((retrato) => {
              const current = markersRef.current.get(key);
              if (
                current !== managed ||
                current.portraitRequestKey !== portraitRequestKey ||
                !retrato
              ) {
                return;
              }
              const lado = selected ? 42 : 32;
              current.marker.setIcon({
                url: retrato,
                scaledSize: new google.maps.Size(lado, lado),
                anchor: new google.maps.Point(lado / 2, lado / 2),
              });
              current.appearanceKey = `driver-portrait:${portraitRequestKey}`;
            });
          }
        } else {
          const fallbackKey = `driver-fallback:${portraitRequestKey}`;
          managed.portraitRequestKey = portraitRequestKey;
          if (managed.appearanceKey !== fallbackKey) {
            managed.marker.setIcon({
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: COR_DO_MOTOBOY,
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
              scale: 7,
            });
            managed.appearanceKey = fallbackKey;
          }
        }
      }
    }

    for (const [key, managed] of markersRef.current) {
      if (desiredKeys.has(key)) continue;
      managed.clickListener?.remove();
      managed.marker.setMap(null);
      markersRef.current.delete(key);
    }
    /**
     * Enquadrar so quando ha o que enquadrar.
     *
     * `fitBounds` com um unico marcador recebe bordas de tamanho zero e o
     * Google responde com o zoom maximo — a tela saltava da cidade para a
     * calcada de um endereco so. Com um ponto, o certo e centralizar e deixar o
     * zoom como esta, o que tambem respeita quem ja tinha ajustado a vista.
     */
    const shouldReframe = lastCameraScopeRef.current !== cameraScope;
    lastCameraScopeRef.current = cameraScope;
    if (shouldReframe) {
      const map = mapRef.current;
      if (markersRef.current.size === 1) {
        const onlyMarker = markersRef.current.values().next().value as ManagedMarker;
        map.setCenter(onlyMarker.marker.getPosition()!);
      } else if (markersRef.current.size > 1) {
        google.maps.event.addListenerOnce(map, 'idle', () => {
          const zoom = map.getZoom();
          if (zoom !== undefined && zoom > MAX_AUTO_ZOOM) map.setZoom(MAX_AUTO_ZOOM);
        });
        map.fitBounds(bounds, 64);
      }
    }

  }, [deliveries, pickupAddress.lat, pickupAddress.lng, ready, selectedId]);

  return (
    <div className="premium-panel relative h-full min-h-[480px] overflow-hidden rounded-3xl border-2 border-white/85 bg-muted ring-1 ring-portal/10">
      <div ref={containerRef} className="absolute inset-0" />
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-muted/95 p-6 text-center text-sm text-muted-foreground backdrop-blur-sm">
          {error}
        </div>
      )}
      <div className="absolute top-4 left-4 rounded-xl border border-white/75 bg-asfalto/88 px-3.5 py-2.5 text-xs text-white shadow-[0_12px_30px_-16px_rgba(3,24,31,0.85)] backdrop-blur-md">
        <span className="font-semibold text-white">Mapa operacional</span>
        <span className="text-white/60"> · {deliveries.length} pedidos</span>
      </div>
    </div>
  );
}
