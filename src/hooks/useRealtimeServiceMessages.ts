import { useEffect } from 'react';

import { ServiceMessage } from '../lib/database';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

/**
 * Mensajes nuevos del chat 1 a 1 del servicio (tabla `service_messages`,
 * migración 0010). El filtro por `service_id` reduce el tráfico; el RLS sigue
 * limitando qué filas puede leer cada usuario.
 */
export function useRealtimeServiceMessages(
  serviceId: string | undefined,
  onMessage: (message: ServiceMessage) => void
) {
  useEffect(() => {
    if (!isSupabaseConfigured || !serviceId) return;

    const channel = supabase
      .channel(`service-messages-${serviceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'service_messages',
          filter: `service_id=eq.${serviceId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (!row?.id) return;
          onMessage({
            id: row.id,
            service_id: row.service_id,
            driver_id: row.driver_id,
            sender_id: row.sender_id ?? null,
            content: row.content,
            type: row.type,
            metadata: row.metadata || {},
            created_at: row.created_at,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [serviceId, onMessage]);
}
