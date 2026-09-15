/**
 * Ubicación del dispositivo.
 *
 * Se usa la geolocalización del navegador (`navigator.geolocation`), que es la
 * que está disponible en la versión web de la app sin añadir dependencias
 * (expo-location implicaría instalar y reiniciar el servidor de desarrollo).
 * En nativo, si no existe `navigator.geolocation`, se devuelve null y las
 * funciones que la usan simplemente no muestran distancias.
 *
 * Nunca se pide permiso al abrir la pantalla: se llama solo cuando el usuario
 * tiene premium y hace falta medir la distancia al origen.
 */

export interface Ubicacion {
  lat: number;
  lng: number;
  /** Precisión en metros, si el navegador la informa. */
  precision?: number;
}

export function hayGeolocalizacion(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.geolocation);
}

/** Última posición conocida (para no repetir el permiso en cada servicio). */
let ultima: Ubicacion | null = null;

export function ultimaUbicacion(): Ubicacion | null {
  return ultima;
}

/** Pide la posición actual. Devuelve null si no hay permiso o no hay soporte. */
export function obtenerUbicacion(timeoutMs = 10000): Promise<Ubicacion | null> {
  if (!hayGeolocalizacion()) return Promise.resolve(null);

  return new Promise((resolve) => {
    let resuelto = false;
    const terminar = (valor: Ubicacion | null) => {
      if (resuelto) return;
      resuelto = true;
      if (valor) ultima = valor;
      resolve(valor);
    };

    const temporizador = setTimeout(() => terminar(ultima), timeoutMs);

    try {
      navigator.geolocation.getCurrentPosition(
        (posicion) =>
          terminar({
            lat: posicion.coords.latitude,
            lng: posicion.coords.longitude,
            precision: posicion.coords.accuracy,
          }),
        (error) => {
          // eslint-disable-next-line no-console
          console.warn('[geolocation] no se pudo obtener la posición:', error?.message);
          clearTimeout(temporizador);
          terminar(ultima);
        },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 }
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[geolocation] error inesperado:', err);
      clearTimeout(temporizador);
      terminar(ultima);
    }
  });
}
