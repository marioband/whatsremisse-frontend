import { useEffect, useRef } from 'react';

import { mapApplicationFromDb } from '../lib/database';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { Application } from '../types';
import { DbApplication } from '../types/database';

export type CambioAplicacion =
  | { evento: 'INSERT' | 'UPDATE'; aplicacion: Application }
  | { evento: 'DELETE'; serviceId: string; driverId: string };

let canalAplicaciones = 0;

/** Postulaciones en vivo (para que el contador de postulantes no se quede viejo). */
export function useRealtimeApplications(
  onChange: (cambio: CambioAplicacion) => void,
  /** Sube cuando la app vuelve del fondo: fuerza a rehacer la suscripción. */
  generacion = 0
) {
  const callbackRef = useRef(onChange);
  useEffect(() => {
    callbackRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const channel = supabase
      .channel(`applications_changes_${++canalAplicaciones}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'applications' },
        (payload) => {
          const tipo = String(payload.eventType || '').toUpperCase();

          if (tipo === 'DELETE') {
            const old = payload.old as Record<string, unknown> | null;
            const serviceId = old?.service_id;
            const driverId = old?.driver_id;
            if (typeof serviceId === 'string' && typeof driverId === 'string') {
              callbackRef.current({ evento: 'DELETE', serviceId, driverId });
            }
            return;
          }

          const row = payload.new as Record<string, unknown>;
          if (!row || !row.id) return;
          callbackRef.current({
            evento: tipo === 'INSERT' ? 'INSERT' : 'UPDATE',
            aplicacion: mapApplicationFromDb(row as unknown as DbApplication),
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [generacion]);
}
