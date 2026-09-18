/**
 * Avisa cuando la app VUELVE: la pestaña pasa a visible (web) o la app sale del fondo
 * (nativo).
 *
 * Por qué existe: en el iPhone, Safari **congela la pestaña** en cuanto sales (abrir Waze,
 * cambiar de app, bloquear la pantalla) y al volver la conexión de avisos está muerta sin
 * que nadie se entere. La app no tenía NADA que atendiera ese regreso, así que se quedaba
 * con los datos viejos hasta el respaldo periódico (15 s; 6 s dentro del chat): el
 * "tarda unos segundos en aparecer el postulante" que reportó el usuario (18-09-2026).
 * En la computadora no se nota porque la pestaña nunca se duerme.
 *
 * No decide QUÉ hacer al volver: eso lo pone quien lo usa (releer los datos, volver a
 * levantar los canales de tiempo real…). Aquí solo se detecta el regreso.
 *
 * Detalles que importan:
 *   - `visibilitychange` es lo que dispara iOS Safari al volver de otra app.
 *   - `pageshow` cubre el caso de la página servida desde la caché de ida/vuelta del
 *     navegador (Safari la usa al volver de otra app): ahí la página ni se recarga.
 *   - Los dos pueden dispararse juntos, así que el aviso se agrupa (VENTANA_MS) para no
 *     releer dos veces seguidas.
 */
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

/** Si dos avisos caen dentro de esta ventana, se atiende uno solo. */
export const VENTANA_DE_AGRUPACION_MS = 1200;

export function useAlVolverALaApp(alVolver: () => void): void {
  const callbackRef = useRef(alVolver);
  useEffect(() => {
    callbackRef.current = alVolver;
  }, [alVolver]);

  useEffect(() => {
    let oculto = false;
    let ultimoAviso = 0;

    const avisar = () => {
      const ahora = Date.now();
      if (ahora - ultimoAviso < VENTANA_DE_AGRUPACION_MS) return;
      ultimoAviso = ahora;
      callbackRef.current();
    };

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const alCambiarVisibilidad = () => {
        if (document.hidden) {
          oculto = true;
          return;
        }
        // Volvió a estar visible: si nunca se ocultó, no hay nada que recuperar.
        if (!oculto) return;
        oculto = false;
        avisar();
      };
      const alVolverDeLaCache = () => {
        oculto = false;
        avisar();
      };

      document.addEventListener('visibilitychange', alCambiarVisibilidad);
      if (typeof window !== 'undefined') {
        window.addEventListener('pageshow', alVolverDeLaCache);
      }
      return () => {
        document.removeEventListener('visibilitychange', alCambiarVisibilidad);
        if (typeof window !== 'undefined') {
          window.removeEventListener('pageshow', alVolverDeLaCache);
        }
      };
    }

    const suscripcion = AppState.addEventListener('change', (estado) => {
      if (estado === 'background' || estado === 'inactive') {
        oculto = true;
        return;
      }
      if (!oculto) return;
      oculto = false;
      avisar();
    });
    return () => suscripcion.remove();
  }, []);
}
