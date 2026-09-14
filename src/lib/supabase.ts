import {
  createClient,
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan credenciales de Supabase. Configura EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY en el archivo .env.'
  );
}

// eslint-disable-next-line no-console
console.log('[Supabase] Usando URL:', supabaseUrl);

export const isSupabaseConfigured = true;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Wrapper tipado para invocar Edge Functions de Supabase.
 */
export async function invokeFunction<T = any>(
  name: string,
  payload?: Record<string, any>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body: payload });
  if (error) {
    if (error instanceof FunctionsFetchError) {
      throw new Error(`Network error calling ${name}: ${error.message}`);
    }
    if (error instanceof FunctionsHttpError || error instanceof FunctionsRelayError) {
      throw new Error(`Function ${name} error: ${error.message}`);
    }
    throw error;
  }
  return (data ?? {}) as T;
}
