import { useEffect } from 'react';

import { leerCache, guardarCache } from '../lib/cache';
import { publicarMiPosicion } from '../lib/database';
import { seMovioLoSuficiente, TTL_RUTA_CON_POSICION_MS } from '../lib/geo';
import { obtenerUbicacion, ultimaUbicacion } from '../lib/geolocation';
import { registrarAhorro } from '../lib/medidor';

/**
 * Publica mi última posición para que un proveedor pueda ver a qué distancia
 * estoy de su punto de origen.
 *
 * Reglas (para no gastar nada de más):
 *   - Solo la escribe el conductor, y solo si el sistema da la ubicación.
 *   - Como mucho una escritura cada 5 minutos Y solo si me moví 500 m o más: se
 *     apoya en la caché persistente (sobrevive a recargar la app), así que abrir
 *     la pantalla varias veces seguidas no genera ninguna escritura.
 *   - Si la migración 0009 no está aplicada, `publicarMiPosicion` devuelve false
 *     sin error: la app sigue funcionando igual.
 */
export function usePosicionPublicada(habilitado: boolean): void {
  useEffect(() => {
    if (!habilitado) return;
    let vigente = true;

    (async () => {
      const ubicacion = ultimaUbicacion() || (await obtenerUbicacion());
      if (!vigente || !ubicacion) return;
      const punto = { lat: ubicacion.lat, lng: ubicacion.lng };

      const publicada = await leerCache<{ lat: number; lng: number }>(
        'mi-posicion-publicada',
        TTL_RUTA_CON_POSICION_MS
      );
      if (publicada && !seMovioLoSuficiente(publicada, punto)) {
        registrarAhorro('cache');
        return;
      }

      try {
        const guardada = await publicarMiPosicion(punto.lat, punto.lng);
        if (guardada && vigente) {
          await guardarCache('mi-posicion-publicada', punto);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[posicion] no se pudo publicar la ubicación:', err);
      }
    })();

    return () => {
      vigente = false;
    };
  }, [habilitado]);
}
