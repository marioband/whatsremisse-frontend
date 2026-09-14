import { useEffect } from 'react';

import { GroupItem } from '../context/MockStoreContext';
import { supabase } from '../lib/supabase';

export function useRealtimeGroups(
  userId: string | undefined,
  onChange: (group: GroupItem) => void
) {
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('groups-realtime')
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
              onChange({
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
      channel.unsubscribe();
    };
  }, [userId, onChange]);
}
