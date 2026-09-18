import { useEffect, useRef } from 'react';

import { avisarDeMensajeDeLaBase } from '../lib/avisos';
import { ServiceMessage } from '../lib/database';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

/**
 * Quién soy y qué papel tengo: es lo que decide si el mensaje que entra por tiempo
 * real se avisa. El aviso es para el que RECIBE, nunca para el que escribe.
 */
export interface AvisoEnVivo {
  miId?: string | null;
  miRol?: 'DRIVER' | 'PROVIDER' | null;
}

export interface ServiceMessageCallbacks {
  /** Mensaje nuevo en la conversación. */
  onMessage: (message: ServiceMessage) => void;
  /** Mensaje editado por su autor (migración 0019): llega con el texto nuevo. */
  onUpdate?: (message: ServiceMessage) => void;
  /**
   * Alguien borró un mensaje (0019). El evento DELETE no trae la fila completa,
   * así que la pantalla relee la conversación en vez de intentar reconstruirla.
   */
  onDelete?: () => void;
  /**
   * Cambió una marca de lectura (0020): la pantalla relee las marcas para
   * repintar las palomitas de sus mensajes.
   */
  onReads?: () => void;
}

function filaDesdeEvento(row: any): ServiceMessage {
  return {
    id: row.id,
    service_id: row.service_id,
    driver_id: row.driver_id,
    sender_id: row.sender_id ?? null,
    content: row.content,
    type: row.type,
    metadata: row.metadata || {},
    created_at: row.created_at,
    edited_at: row.edited_at ?? null,
  };
}

/**
 * Mensajes del chat 1 a 1 del servicio (tabla `service_messages`, migración
 * 0010) en tiempo real: altas, ediciones (0019) y borrados. El filtro por
 * `service_id` reduce el tráfico; el RLS sigue limitando qué filas puede leer
 * cada usuario.
 *
 * Los UPDATE llegan con la fila completa, así que se filtran por `service_id`.
 * Los DELETE solo traen la clave, así que se escuchan sin filtro y la pantalla
 * relee (el sondeo de respaldo hace el resto si el proyecto no tiene el tiempo
 * real activado).
 */
export function useRealtimeServiceMessages(
  serviceId: string | undefined,
  callbacks: ServiceMessageCallbacks,
  aviso: AvisoEnVivo = {}
) {
  const { onMessage, onUpdate, onDelete, onReads } = callbacks;
  // En un ref para no volver a suscribirse cuando cambie el rol o el id.
  const avisoRef = useRef(aviso);
  useEffect(() => {
    avisoRef.current = aviso;
  }, [aviso]);

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
          onMessage(filaDesdeEvento(row));
          // Por cada mensaje (y por cada hito del viaje, que llega como aviso del
          // sistema) el aviso se da en el dispositivo que lo RECIBE.
          avisarDeMensajeDeLaBase(row, {
            miId: avisoRef.current.miId,
            miRol: avisoRef.current.miRol,
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'service_messages',
          filter: `service_id=eq.${serviceId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (!row?.id || !onUpdate) return;
          onUpdate(filaDesdeEvento(row));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'service_messages' },
        () => {
          onDelete?.();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_chat_reads',
          filter: `service_id=eq.${serviceId}`,
        },
        () => {
          onReads?.();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [serviceId, onMessage, onUpdate, onDelete, onReads]);
}
