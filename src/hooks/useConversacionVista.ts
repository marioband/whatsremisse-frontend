/**
 * La marca de «estoy viendo esta conversación» (pedido del usuario, 20-09-2026).
 *
 * Se monta en las DOS pantallas de chat (servicio y grupo). Lo que hace:
 *   - al abrir: marca la conversación en el servidor (así no le llega el aviso de lo que ya ve);
 *   - mientras la app esté A LA VISTA: repite la marca cada `LATIDO_MS` (el servidor la da por
 *     buena 2 minutos);
 *   - al minimizar, cambiar de app o bloquear el teléfono: la BORRA en el acto, para que el aviso
 *     vuelva a llegar sin esperar a que venza (es lo que pidió el usuario);
 *   - al salir del chat: la borra también.
 *
 * La decisión (marcar / cerrar) no está aquí: vive en `lib/conversacionVista` para poder probarla
 * con node sin React ni navegador.
 */
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { cerrarConversacionVista, marcarConversacionVista } from '../lib/database';
import {
  LATIDO_MS,
  decisionDeLaMarca,
  olvidarLaConversacion,
  recordarQueEstoyViendo,
} from '../lib/conversacionVista';

/** ¿La app está fuera de la vista? (pestaña oculta en web; app en segundo plano en nativo) */
export function appOculta(): boolean {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return document.hidden === true;
  }
  return AppState.currentState !== 'active';
}

/** Marca `url` mientras la pantalla esté abierta y la app a la vista. */
export function useConversacionVista(url: string): void {
  useEffect(() => {
    if (!url) return;
    let vivo = true;

    const aplicar = () => {
      if (!vivo) return;
      const decision = decisionDeLaMarca(url, appOculta());
      if (decision === 'marcar') {
        recordarQueEstoyViendo(url);
        void marcarConversacionVista(url).catch(() => undefined);
        return;
      }
      if (decision === 'cerrar') {
        olvidarLaConversacion();
        void cerrarConversacionVista().catch(() => undefined);
      }
    };

    aplicar();
    const latido = setInterval(aplicar, LATIDO_MS);

    // `visibilitychange` es lo que dispara iOS Safari al minimizar y al volver.
    let quitar: () => void;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', aplicar);
      quitar = () => document.removeEventListener('visibilitychange', aplicar);
    } else {
      const suscripcion = AppState.addEventListener('change', aplicar);
      quitar = () => suscripcion.remove();
    }

    return () => {
      vivo = false;
      clearInterval(latido);
      quitar();
      // Al salir del chat los avisos de esa conversación vuelven.
      olvidarLaConversacion();
      void cerrarConversacionVista().catch(() => undefined);
    };
  }, [url]);
}
