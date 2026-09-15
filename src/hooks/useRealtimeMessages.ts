import { useEffect } from 'react';

import { ChatMessage } from '../lib/database';
import { supabase } from '../lib/supabase';

export function useRealtimeMessages(
  groupId: string | undefined,
  onMessage: (message: ChatMessage) => void
) {
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
          onMessage({
            id: row.id,
            group_id: row.group_id,
            sender_id: row.sender_id,
            // Sin nombre todavía: la pantalla lo resuelve con los integrantes
            // del grupo. Antes se pintaba el UUID del remitente.
            sender_name: '',
            content: row.content,
            type: row.type,
            created_at: row.created_at,
          });
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [groupId, onMessage]);
}
