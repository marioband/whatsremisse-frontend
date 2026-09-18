import { useEffect, useRef } from 'react';

import { avisarDeMensajeDeLaBase } from '../lib/avisos';
import { ChatMessage } from '../lib/database';
import { supabase } from '../lib/supabase';

/** Quién soy y en qué grupo: el aviso es para el que recibe, no para el que escribe. */
export interface AvisoDeGrupo {
  miId?: string | null;
  nombreDelGrupo?: string;
}

export interface GroupMessageCallbacks {
  /** Mensaje nuevo en el grupo. */
  onMessage: (message: ChatMessage) => void;
  /** Mensaje editado por su autor (migración 0019): llega con el texto nuevo. */
  onUpdate?: (message: ChatMessage) => void;
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

function filaDesdeEvento(row: any): ChatMessage {
  return {
    id: row.id,
    group_id: row.group_id,
    sender_id: row.sender_id,
    // Sin nombre todavía: la pantalla lo resuelve con los integrantes del grupo.
    // Antes se pintaba el UUID del remitente.
    sender_name: '',
    content: row.content,
    type: row.type,
    created_at: row.created_at,
    edited_at: row.edited_at ?? null,
  };
}

/**
 * Mensajes del chat de grupo (tabla `messages`) en tiempo real: altas, ediciones
 * (0019) y borrados. Igual que en el chat del servicio, el UPDATE se filtra por
 * `group_id` y el DELETE se atiende sin filtro (solo trae la clave) para que la
 * pantalla relea la conversación.
 */
export function useRealtimeMessages(
  groupId: string | undefined,
  callbacks: GroupMessageCallbacks,
  aviso: AvisoDeGrupo = {}
) {
  const { onMessage, onUpdate, onDelete, onReads } = callbacks;
  const avisoRef = useRef(aviso);
  useEffect(() => {
    avisoRef.current = aviso;
  }, [aviso]);

  useEffect(() => {
    if (!groupId) return;

    const channel = supabase
      .channel(`messages-${groupId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (!row?.id) return;
          onMessage(filaDesdeEvento(row));
          avisarDeMensajeDeLaBase(row, {
            miId: avisoRef.current.miId,
            enGrupo: true,
            nombreDelGrupo: avisoRef.current.nombreDelGrupo,
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (!row?.id || !onUpdate) return;
          onUpdate(filaDesdeEvento(row));
        }
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, () => {
        onDelete?.();
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_chat_reads',
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          onReads?.();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [groupId, onMessage, onUpdate, onDelete, onReads]);
}
