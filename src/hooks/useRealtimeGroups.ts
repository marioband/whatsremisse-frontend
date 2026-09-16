import { useEffect, useRef } from 'react';

import { GroupItem } from '../context/MockStoreContext';
import { supabase } from '../lib/supabase';

let canalGrupos = 0;

/**
 * Mis grupos en vivo (rol y favorito). Al cambiar cualquier grupo se releen mis
 * membresías: la tabla `group_members` no se puede filtrar por usuario en el
 * canal, así que se resuelve con una consulta.
 */
export function useRealtimeGroups(
  userId: string | undefined,
  onChange: (group: GroupItem) => void
) {
  const callbackRef = useRef(onChange);
  useEffect(() => {
    callbackRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`groups-realtime-${++canalGrupos}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'groups',
        },
        async () => {
          const { data, error } = await supabase
            .from('group_members')
            .select('group_id, role, favorite, groups(id, name, owner_id)')
            .eq('user_id', userId);
          if (error || !data) return;
          data.forEach((row: any) => {
            const group = row.groups;
            if (group) {
              callbackRef.current({
                id: group.id,
                name: group.name,
                role: row.role,
                favorite: row.favorite,
              });
            }
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);
}
