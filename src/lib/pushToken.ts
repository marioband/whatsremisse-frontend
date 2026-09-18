/**
 * Registro del token de Expo Push para que los avisos lleguen con la app CERRADA.
 *
 * La app (con la app abierta) ya avisa al receptor por tiempo real, pero si el teléfono
 * está cerrado no hay nadie escuchando: para eso está el push. El dispositivo recibe su
 * token de Expo y lo guarda en `push_tokens` (migración 0025); desde ahí la BASE avisa por
 * su cuenta en cada mensaje, hito, tarjeta compartida o postulación.
 *
 * Ojo:
 *   * En WEB no hay token de Expo Push: se sale sin hacer nada (ahí los avisos solo suenan
 *     con la app abierta, por tiempo real).
 *   * Hace falta el `projectId` de EAS en `app.json` → `extra.eas.projectId`. Sin él no hay
 *     token: se explica una vez por consola en vez de fallar en silencio.
 *   * Si la migración 0025 todavía no está aplicada, el guardado falla: la app lo avisa en
 *     consola y sigue funcionando (los avisos con la app abierta no dependen de esto).
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { isSupabaseConfigured, supabase } from './supabase';
import { getExpoPushToken } from '../services/notifications';

/** `projectId` de EAS, que es lo que identifica la app ante el servicio de push de Expo. */
export function projectIdDeExpo(): string | null {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, any>;
  const id = extra?.eas?.projectId ?? extra?.expoProjectId ?? '';
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

/**
 * Registra (o refresca) el token de este dispositivo para ese usuario. Devuelve el token
 * guardado o null si no se pudo (web, sin projectId, sin permiso o sin la 0025 aplicada).
 */
export async function registrarTokenDePush(userId: string): Promise<string | null> {
  if (!isSupabaseConfigured || !userId) return null;
  if (Platform.OS === 'web') return null;

  const token = await getExpoPushToken();
  if (!token) return null;

  try {
    const { error } = await supabase.from('push_tokens').upsert(
      {
        user_id: userId,
        token,
        plataforma: Platform.OS,
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: 'user_id,token' }
    );
    if (error) {
      // eslint-disable-next-line no-console
      console.warn(
        '[push] no se pudo guardar el token del dispositivo (¿falta la migración 0025?):',
        error.message
      );
      return null;
    }
    return token;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[push] error guardando el token del dispositivo:', err);
    return null;
  }
}
