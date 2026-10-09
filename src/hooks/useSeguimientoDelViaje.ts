import { useEffect } from 'react';

import { publicarPosicionDelSeguimiento } from '../lib/database';
import { obtenerUbicacion, ultimaUbicacion } from '../lib/geolocation';

/** Cada cuánto se declara la posición de la unidad (el acuerdo con el usuario: 15 s). */
const CADA_MS = 15000;

/**
 * Publica la posición de la unidad para la página pública del viaje (0049).
 *
 * Lo hace el CONDUCTOR asignado mientras su viaje está en curso: ya mismo al arrancar, y
 * después cada 15 segundos (y otra vez al volver a la app). La base tiene su propio límite
 * (12 s): lo que llegue antes se ignora, así que este reloj puede ir tranquilo — nada de
 * lo que mande de más ensucia ni cuesta.
 *
 * `servicio` es el viaje EN CURSO del conductor (null si no hay): cuando el viaje termina,
 * el efecto se deshace solo y deja de pedir ubicación.
 */
export function useSeguimientoDelViaje(servicio: { id: string } | null, habilitado: boolean): void {
  const servicioId = servicio?.id ?? null;

  useEffect(() => {
    if (!habilitado || !servicioId) return;
    let vigente = true;

    const enviar = async () => {
      if (!vigente) return;
      try {
        // Ubicación fresca; si el sistema no responde a tiempo, sirve la última conocida.
        const ubicacion = (await obtenerUbicacion(8000)) || ultimaUbicacion();
        if (!vigente || !ubicacion) return;
        await publicarPosicionDelSeguimiento(servicioId, ubicacion.lat, ubicacion.lng);
      } catch (err) {
        // Silencioso a propósito: si la base no tiene la 0049 o falla la red, el viaje sigue igual.
        // eslint-disable-next-line no-console
        console.warn('[seguimiento] no se pudo publicar la posición:', err);
      }
    };

    enviar();
    const reloj = setInterval(enviar, CADA_MS);
    const alVolver = () => {
      if (!document.hidden) enviar();
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', alVolver);

    return () => {
      vigente = false;
      clearInterval(reloj);
      if (typeof document !== 'undefined')
        document.removeEventListener('visibilitychange', alVolver);
    };
  }, [habilitado, servicioId]);
}
