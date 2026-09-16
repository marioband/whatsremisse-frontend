import { useEffect, useRef } from 'react';

import { mapServiceAlertFromDb } from '../lib/database';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { ServiceAlert } from '../types';
import { DbServiceAlert } from '../types/database';

export type CambioServicio =
  { evento: 'INSERT' | 'UPDATE'; servicio: ServiceAlert } | { evento: 'DELETE'; id: string };

/**
 * Contador para dar un tema único a cada suscripción: si dos componentes (o el
 * doble montaje de React en desarrollo) piden el mismo tema, el servidor rechaza
 * el segundo `join` y el canal queda muerto sin avisar.
 */
let canalServicios = 0;

/**
 * Cambios de `service_alerts` en vivo.
 *
 * Ojo con el borrado: un evento DELETE llega con `new` vacío y solo `old` (la
 * clave primaria), así que hay que mirarlo ANTES de descartar el payload. Antes
 * se descartaba y por eso una tarjeta anulada seguía en el otro dispositivo
 * hasta recargar.
 */
export function useRealtimeServices(onChange: (cambio: CambioServicio) => void) {
  // El callback vive en un ref para que el canal se suscriba UNA vez por montaje
  // (antes el efecto dependía de la función, se resuscribía en cada render y
  // podía quedarse sin canal).
  const callbackRef = useRef(onChange);
  useEffect(() => {
    callbackRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const channel = supabase
      .channel(`service_alerts_changes_${++canalServicios}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_alerts' },
        (payload) => {
          const tipo = String(payload.eventType || '').toUpperCase();

          if (tipo === 'DELETE') {
            const id = (payload.old as Record<string, unknown> | null)?.id;
            if (typeof id === 'string') callbackRef.current({ evento: 'DELETE', id });
            return;
          }

          const row = payload.new as Record<string, unknown>;
          if (!row || !row.id) return;
          callbackRef.current({
            evento: tipo === 'INSERT' ? 'INSERT' : 'UPDATE',
            servicio: mapServiceAlertFromDb(row as unknown as DbServiceAlert),
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
