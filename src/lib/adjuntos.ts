/**
 * Adjuntos del chat: foto (galería), cámara y ubicación.
 *
 * Antes los botones de la bandeja de adjuntos NO accedían a nada: mandaban un mensaje de
 * texto con un emoji («📷 Cámara», «📍 Ubicación») y el de cámara, además, rompía el chat de
 * grupo (intentaba guardar `type='CAMERA'` y la tabla solo admite TEXT/SYSTEM/VOICE/PHOTO/
 * LOCATION/CONTACT → error 23514 y el mensaje se perdía). El usuario lo pidió el
 * 18-09-2026: *"comprueba que funcionen ... los botones de acceso a camara, ubicacion"*.
 *
 * Aquí se pide el permiso de verdad y se devuelve el contenido:
 *   * `elegirFoto`  → selector de fotos (`expo-image-picker`). En web es el selector de
 *     archivos del navegador; en nativo, la galería.
 *   * `tomarFoto`   → cámara (`launchCameraAsync`). En web el navegador abre la cámara del
 *     teléfono cuando el origen es seguro (HTTPS o localhost).
 *   * `ubicacionParaAdjuntar` → posición actual (`expo-location`; en web usa la
 *     geolocalización del navegador). Se comprueba ANTES si el origen es seguro, porque en
 *     HTTP el navegador la niega siempre y el motivo real no es un permiso denegado.
 *   * `subirFoto`   → deja la imagen en el almacén de Supabase (`chat-adjuntos`) y devuelve
 *     su URL pública, que es lo que viaja en el mensaje (una ruta local del teléfono no le
 *     sirve de nada al otro).
 *
 * Todas devuelven `{ ok: false, motivo }` en vez de lanzar: la pantalla muestra el motivo y
 * el chat sigue funcionando (una foto no puede tumbar la conversación).
 */
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { Ubicacion, explicacionDeUbicacion, hayContextoSeguro } from './geolocation';
import { isSupabaseConfigured, supabase } from './supabase';

export type Resultado<T> = { ok: true; valor: T } | { ok: false; motivo: string };

export interface FotoElegida {
  uri: string;
  ancho: number;
  alto: number;
}

/** Bucket del almacén donde viven las fotos del chat. */
export const BUCKET_DE_ADJUNTOS = 'chat-adjuntos';

const CANCELADO = 'cancelado';

function desdeResultado(resultado: ImagePicker.ImagePickerResult): Resultado<FotoElegida> {
  if (resultado.canceled || !resultado.assets?.length) {
    return { ok: false, motivo: CANCELADO };
  }
  const asset = resultado.assets[0];
  return {
    ok: true,
    valor: {
      uri: asset.uri,
      ancho: asset.width ?? 0,
      alto: asset.height ?? 0,
    },
  };
}

/** Fotos de la galería (en web, el selector de archivos del navegador). */
export async function elegirFoto(): Promise<Resultado<FotoElegida>> {
  try {
    if (Platform.OS !== 'web') {
      const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permiso.granted) {
        return { ok: false, motivo: 'Permite el acceso a tus fotos para poder adjuntarlas.' };
      }
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    return desdeResultado(resultado);
  } catch (err) {
    return { ok: false, motivo: `No se pudo abrir la galería: ${mensajeDeError(err)}` };
  }
}

/** Cámara: pide el permiso y toma la foto. */
export async function tomarFoto(): Promise<Resultado<FotoElegida>> {
  try {
    if (Platform.OS !== 'web') {
      const permiso = await ImagePicker.requestCameraPermissionsAsync();
      if (!permiso.granted) {
        return { ok: false, motivo: 'Permite el acceso a la cámara para poder tomar la foto.' };
      }
    }
    const resultado = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    return desdeResultado(resultado);
  } catch (err) {
    return { ok: false, motivo: `No se pudo usar la cámara: ${mensajeDeError(err)}` };
  }
}

/**
 * Ubicación para adjuntar al chat. Pide el permiso (el navegador o el sistema muestran su
 * diálogo) y devuelve la posición con su precisión.
 */
export async function ubicacionParaAdjuntar(): Promise<Resultado<Ubicacion>> {
  // En web, un origen no seguro (HTTP sobre una IP) hace que el navegador niegue siempre la
  // ubicación: se dice el motivo real en vez de un «permiso denegado» engañoso.
  if (Platform.OS === 'web' && !hayContextoSeguro()) {
    return {
      ok: false,
      motivo:
        explicacionDeUbicacion() ?? 'La app debe abrirse por HTTPS para poder usar tu ubicación.',
    };
  }

  try {
    const permiso = await Location.requestForegroundPermissionsAsync();
    if (permiso.status !== 'granted') {
      return { ok: false, motivo: 'Permite el acceso a tu ubicación para compartirla en el chat.' };
    }
    const posicion = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      ok: true,
      valor: {
        lat: posicion.coords.latitude,
        lng: posicion.coords.longitude,
        precision: posicion.coords.accuracy ?? undefined,
      },
    };
  } catch (err) {
    return { ok: false, motivo: `No se pudo obtener la ubicación: ${mensajeDeError(err)}` };
  }
}

/**
 * Sube la foto al almacén de Supabase y devuelve su URL pública.
 *
 * La ruta empieza por el id del usuario (`<user_id>/<marca>.<ext>`) porque las políticas
 * del bucket (migración 0026) dejan escribir SOLO en la carpeta propia.
 */
export async function subirFoto(foto: FotoElegida, userId: string): Promise<Resultado<string>> {
  if (!isSupabaseConfigured) {
    return { ok: false, motivo: 'La app no tiene configurado su almacén de archivos.' };
  }
  try {
    const respuesta = await fetch(foto.uri);
    const blob = await respuesta.blob();
    const extension = extensionDe(foto.uri, blob.type);
    const ruta = `${userId}/${Date.now()}-${Math.floor(Math.random() * 1e6)}.${extension}`;

    const { error } = await supabase.storage
      .from(BUCKET_DE_ADJUNTOS)
      .upload(ruta, blob, { contentType: blob.type || `image/${extension}`, upsert: false });

    if (error) {
      return { ok: false, motivo: `No se pudo subir la foto: ${error.message}` };
    }

    const { data } = supabase.storage.from(BUCKET_DE_ADJUNTOS).getPublicUrl(ruta);
    if (!data?.publicUrl) {
      return { ok: false, motivo: 'El almacén no devolvió la dirección de la foto.' };
    }
    return { ok: true, valor: data.publicUrl };
  } catch (err) {
    return { ok: false, motivo: `No se pudo preparar la foto: ${mensajeDeError(err)}` };
  }
}

/** ¿El usuario canceló el selector? (no hay que avisar de nada) */
export function fueCancelado(resultado: Resultado<unknown>): boolean {
  return !resultado.ok && (resultado as { motivo?: string }).motivo === CANCELADO;
}

/**
 * Texto de un mensaje de ubicación: se ve la dirección legible si la tenemos y, si no, las
 * coordenadas (que es lo que permite abrir el mapa).
 */
export function textoDeUbicacion(ubicacion: Ubicacion): string {
  return `📍 Ubicación compartida (${ubicacion.lat.toFixed(5)}, ${ubicacion.lng.toFixed(5)})`;
}

/** Texto del mensaje de una foto. */
export function textoDeFoto(quienLaToma: boolean): string {
  return quienLaToma ? '📷 Foto' : '🖼️ Foto';
}

function extensionDe(uri: string, tipoMime: string): string {
  const limpio = (uri.split('?')[0] || '').split('.').pop() || '';
  if (/^(jpg|jpeg|png|webp|heic)$/i.test(limpio)) return limpio.toLowerCase();
  if (tipoMime.includes('png')) return 'png';
  if (tipoMime.includes('webp')) return 'webp';
  return 'jpg';
}

function mensajeDeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
