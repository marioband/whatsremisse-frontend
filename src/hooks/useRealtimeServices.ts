import { useEffect } from 'react';

import { mapServiceAlertFromDb } from '../lib/database';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { ServiceAlert } from '../types';
import { DbServiceAlert } from '../types/database';

export function useRealtimeServices(onChange: (service: ServiceAlert) => void) {
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const channel = supabase
      .channel('service_alerts_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_alerts' },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (!row || !row.id) return;
          onChange(mapServiceAlertFromDb(row as unknown as DbServiceAlert));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onChange]);
}
