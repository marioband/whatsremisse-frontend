/**
 * Sugerencias de dirección con Google Places (API nueva: Places API (New)).
 *
 * Notas de facturación (lo que hay que configurar en Google Cloud):
 *  - Se usa Autocomplete por sesión: un `sessionToken` por tanda de escritura y
 *    una única llamada a Place Details al elegir una sugerencia. Así el par
 *    (autocompletado + detalle) se cobra como una sola sesión.
 *  - Cada petición lleva un `X-Goog-FieldMask` con lo mínimo: pedir de más sube
 *    el precio (hay tarifas por campos/máscaras).
 *  - La `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` viaja en el cliente: debe estar
 *    restringida por referrer HTTP (web) y por app (Android/iOS) en Google
 *    Cloud, y limitada a Places API (New) y Routes API.
 *
 * Sin clave configurada, todas estas funciones devuelven vacío (la app sigue
 * funcionando con lo que escribe el usuario: eso nunca se bloquea).
 */

import { registrarLlamada } from './medidor';

export interface SugerenciaDireccion {
  /** Identificador del lugar (place_id) para pedir el detalle. */
  placeId: string;
  /** Primera línea: nombre de la calle o del lugar. */
  principal: string;
  /** Segunda línea: distrito, ciudad, región. */
  secundario: string;
  /** Dirección completa propuesta (es lo que se escribe en el campo). */
  texto: string;
}

export interface DireccionElegida {
  texto: string;
  lat: number | null;
  lng: number | null;
}

const URL_AUTOCOMPLETADO = 'https://places.googleapis.com/v1/places:autocomplete';
const URL_DETALLE = 'https://places.googleapis.com/v1/places';

/** Campos mínimos del autocompletado: texto y place_id (nada de coordenadas). */
export const CAMPOS_AUTOCOMPLETADO =
  'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text';

/** Al elegir una sugerencia sí hacen falta dirección y coordenadas. */
export const CAMPOS_DETALLE = 'formattedAddress,location';

/** Clave pública de Google Maps (vacía si el usuario todavía no la configuró). */
export function claveDeGoogle(): string {
  return (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '').trim();
}

/** ¿Hay clave con la que pedir sugerencias? */
export function hayApiDeDirecciones(): boolean {
  return claveDeGoogle().length > 0;
}

/** Token de sesión (agrupa autocompletado + detalle en una sola unidad de cobro). */
export function nuevaSesion(): string {
  return `wr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Cuerpo de la petición de autocompletado (aparte, para poder probarlo). */
export function cuerpoDeAutocompletado(
  input: string,
  sessionToken: string,
  opciones: { pais?: string; limite?: number; lat?: number; lng?: number } = {}
): Record<string, unknown> {
  const cuerpo: Record<string, unknown> = {
    input,
    sessionToken,
    languageCode: 'es',
    includedRegionCodes: [opciones.pais || 'pe'],
  };
  if (opciones.lat !== undefined && opciones.lng !== undefined) {
    // Mejora la relevancia: prioriza lo que está cerca del usuario.
    cuerpo.locationBias = {
      circle: { center: { latitude: opciones.lat, longitude: opciones.lng }, radius: 30000 },
    };
  }
  return cuerpo;
}

/** Convierte la respuesta de Google en nuestra lista, sin campos de más. */
export function leerSugerencias(respuesta: unknown): SugerenciaDireccion[] {
  const datos = respuesta as {
    suggestions?: {
      placePrediction?: {
        placeId?: string;
        text?: { text?: string };
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
      };
    }[];
  };
  if (!datos?.suggestions) return [];

  return datos.suggestions
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
    .map((p) => {
      const principal = p.structuredFormat?.mainText?.text || p.text?.text || '';
      const secundario = p.structuredFormat?.secondaryText?.text || '';
      return {
        placeId: String(p.placeId),
        principal,
        secundario,
        texto: p.text?.text || [principal, secundario].filter(Boolean).join(', '),
      };
    })
    .filter((s) => s.texto.length > 0);
}

async function pedir(url: string, opciones: RequestInit, timeoutMs: number): Promise<unknown> {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    const respuesta = await fetch(url, { ...opciones, signal: controlador.signal });
    if (!respuesta.ok) {
      // Se registra el motivo real (clave sin permisos, API no habilitada, cuota).
      const detalle = await respuesta.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.warn(`[places] ${respuesta.status} en ${url}: ${detalle.slice(0, 300)}`);
      return null;
    }
    return await respuesta.json();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[places] error de red:', err);
    return null;
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * Sugerencias para lo que el usuario va escribiendo.
 * Devuelve [] si no hay clave o si Google falla: el campo nunca se bloquea.
 */
export async function sugerirDirecciones(
  input: string,
  sessionToken: string,
  ubicacion?: { lat: number; lng: number } | null
): Promise<SugerenciaDireccion[]> {
  const texto = input.trim();
  if (!hayApiDeDirecciones() || texto.length < 4) return [];

  registrarLlamada('places:autocompletado');
  const respuesta = await pedir(
    URL_AUTOCOMPLETADO,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': claveDeGoogle(),
        'X-Goog-FieldMask': CAMPOS_AUTOCOMPLETADO,
      },
      body: JSON.stringify(
        cuerpoDeAutocompletado(texto, sessionToken, {
          lat: ubicacion?.lat,
          lng: ubicacion?.lng,
        })
      ),
    },
    8000
  );

  return leerSugerencias(respuesta);
}

/**
 * Al elegir una sugerencia: dirección formateada y coordenadas.
 * Es la llamada que cierra la sesión de cobro.
 */
export async function detalleDeDireccion(
  placeId: string,
  sessionToken: string
): Promise<DireccionElegida | null> {
  if (!hayApiDeDirecciones()) return null;

  registrarLlamada('places:detalle');
  const url = `${URL_DETALLE}/${encodeURIComponent(placeId)}?languageCode=es&sessionToken=${encodeURIComponent(sessionToken)}`;
  const respuesta = (await pedir(
    url,
    {
      method: 'GET',
      headers: { 'X-Goog-Api-Key': claveDeGoogle(), 'X-Goog-FieldMask': CAMPOS_DETALLE },
    },
    8000
  )) as { formattedAddress?: string; location?: { latitude?: number; longitude?: number } } | null;

  if (!respuesta?.formattedAddress) return null;
  return {
    texto: respuesta.formattedAddress,
    lat: respuesta.location?.latitude ?? null,
    lng: respuesta.location?.longitude ?? null,
  };
}
