declare global {
  interface Window {
    motoboyCityGoogleMaps?: Promise<typeof google>;
  }
}

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Mapa indisponível.'));
  if (window.google?.maps) return Promise.resolve(window.google);
  if (window.motoboyCityGoogleMaps) return window.motoboyCityGoogleMaps;

  const apiKey = process.env['NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY'];
  if (!apiKey) {
    return Promise.reject(
      new Error('Configure NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY para exibir o mapa.'),
    );
  }
  window.motoboyCityGoogleMaps = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async`;
    script.async = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error('Não foi possível carregar o Google Maps.'));
    document.head.appendChild(script);
  });
  return window.motoboyCityGoogleMaps;
}

export {};
