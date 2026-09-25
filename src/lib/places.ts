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

import { MINIMO_CARACTERES_PARA_GOOGLE } from './addressSuggestions';
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
  /** Los tipos del lugar (los usa `textoDelCampo` para decidir si se queda el nombre). */
  tipos?: string[];
}

const URL_AUTOCOMPLETADO = 'https://places.googleapis.com/v1/places:autocomplete';
const URL_DETALLE = 'https://places.googleapis.com/v1/places';

/** Campos mínimos del autocompletado: texto y place_id (nada de coordenadas). */
export const CAMPOS_AUTOCOMPLETADO =
  'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text';

/**
 * Al elegir una sugerencia sí hacen falta dirección, coordenadas y los TIPOS del lugar.
 *
 * «types» es lo que deja saber si lo elegido es un lugar con nombre (un aeropuerto, un centro
 * comercial) o una dirección de calle — y va en la MISMA unidad de cobro (Place Details
 * Essentials), igual que `formattedAddress` y `location`. NO se pide `displayName` a propósito:
 * ese campo es del SKU **Pro** y subiría el precio de cada búsqueda solo por escribir el nombre,
 * que ya lo tenemos del autocompletado (ver `textoDelCampo`).
 */
export const CAMPOS_DETALLE = 'formattedAddress,location,types';

/**
 * Los tipos con los que Google marca un sitio CON NOMBRE propio. Si aparece alguno, lo elegido es
 * un lugar (y se queda su nombre); si solo salen tipos de dirección, es una dirección y se queda la
 * dirección exacta, como hasta ahora.
 */
const TIPOS_DE_LUGAR: readonly string[] = [
  'point_of_interest',
  'establishment',
  'premise',
  'subpremise',
  'airport',
  'transit_station',
  'train_station',
  'bus_station',
  'shopping_mall',
  'lodging',
  'hospital',
  'university',
  'school',
  'gas_station',
  'park',
  'stadium',
  'restaurant',
  'store',
];

/** ¿Con estos tipos, lo elegido es un lugar con nombre propio? */
export function esLugarConNombre(tipos?: readonly string[] | null): boolean {
  if (!tipos || tipos.length === 0) return false;
  return tipos.some((tipo) => TIPOS_DE_LUGAR.includes(tipo));
}

/**
 * Lo que se escribe en el campo al elegir una sugerencia.
 *
 * Pedido del usuario (21-09-2026): «en la búsqueda de dirección los nombres de lugares conocidos
 * como “Aeropuerto Jorge Chávez” … al seleccionarlo cambia a la dirección exacta; lo ideal sería
 * que se mantenga con el nombre comercial del lugar». Así que: si es un lugar con nombre, se queda
 * el nombre; si es una dirección, se queda la dirección exacta (y en los dos casos las coordenadas
 * del detalle son las que usan la ruta y la medición de distancia).
 */
export function textoDelCampo(datos: {
  /** El nombre que el usuario vio en la lista (`mainText` de la sugerencia). */
  nombre: string;
  /** La dirección exacta que devolvió el detalle. */
  direccion: string;
  tipos?: readonly string[] | null;
}): string {
  const nombre = (datos.nombre || '').trim();
  const direccion = (datos.direccion || '').trim();
  if (nombre && esLugarConNombre(datos.tipos)) return nombre;
  return direccion || nombre;
}

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

/**
 * Cuántas búsquedas de dirección terminan BIEN y cuántas se quedan a medias.
 *
 * Por qué existe: una sesión de Google se cobra según cómo termina. Si cierra con una
 * elección, las letras de esa búsqueda son gratis; si se queda sin cerrar (el usuario
 * escribió y no eligió nada), Google factura TODAS esas letras. El modelo de costes
 * supone un 30 % de búsquedas abandonadas y ese número no se había medido nunca: es el
 * que decide si un plan gana o pierde.
 *
 * Qué mide, con precisión: por cada token de sesión, si se escribió con él y si cerró
 * con un detalle. La diferencia son las teclas que se facturan sin dar nada a cambio.
 */
const teclasPorSesion = new Map<string, number>();
const sesionesCerradas = new Set<string>();

export interface ResumenDeSesiones {
  /** Sesiones en las que de verdad se escribió. */
  conTecleo: number;
  /** De esas, las que cerraron eligiendo una sugerencia. */
  cerradas: number;
  /** De esas, las que quedaron sin cerrar (se factura cada letra). */
  abandonadas: number;
  /** Letras que se facturan por esas sesiones abandonadas. */
  teclasFacturadasPorAbandono: number;
}

/** Se llama en cada consulta de autocompletado (una letra más de esa sesión). */
export function anotarTecleoDeSesion(token: string): void {
  if (!token) return;
  teclasPorSesion.set(token, (teclasPorSesion.get(token) || 0) + 1);
}

/** Se llama cuando la sesión cierra de verdad (el detalle devolvió la dirección). */
export function anotarSesionCerrada(token: string): void {
  if (!token) return;
  sesionesCerradas.add(token);
}

export function resumenDeSesiones(): ResumenDeSesiones {
  let cerradas = 0;
  let abandonadas = 0;
  let teclasFacturadasPorAbandono = 0;
  teclasPorSesion.forEach((teclas, token) => {
    if (sesionesCerradas.has(token)) cerradas += 1;
    else {
      abandonadas += 1;
      teclasFacturadasPorAbandono += teclas;
    }
  });
  return {
    conTecleo: teclasPorSesion.size,
    cerradas,
    abandonadas,
    teclasFacturadasPorAbandono,
  };
}

export function reiniciarSesiones(): void {
  teclasPorSesion.clear();
  sesionesCerradas.clear();
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
  if (!hayApiDeDirecciones() || texto.length < MINIMO_CARACTERES_PARA_GOOGLE) return [];

  registrarLlamada('places:autocompletado');
  anotarTecleoDeSesion(sessionToken);
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
  )) as {
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    types?: string[];
  } | null;

  if (!respuesta?.formattedAddress) return null;
  // Aquí CIERRA la sesión de cobro: desde este momento las letras de esa búsqueda son gratis.
  anotarSesionCerrada(sessionToken);
  return {
    texto: respuesta.formattedAddress,
    lat: respuesta.location?.latitude ?? null,
    lng: respuesta.location?.longitude ?? null,
    tipos: respuesta.types ?? [],
  };
}
