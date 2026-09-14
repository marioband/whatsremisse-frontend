import { useEffect } from 'react';

import { mapApplicationFromDb } from '../lib/database';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { Application } from '../types';
import { DbApplication } from '../types/database';

export function useRealtimeApplications(onChange: (application: Application) => void) {
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const channel = supabase
      .channel('applications_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'applications' },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (!row || !row.id) return;
          onChange(mapApplicationFromDb(row as unknown as DbApplication));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onChange]);
}
