/**
 * Distancia y duración con Google Routes API (`computeRoutes`).
 *
 * Es la API vigente: la antigua Distance Matrix quedó como legacy y Google
 * recomienda migrar a Routes API. Se pide solo `routes.duration` y
 * `routes.distanceMeters` (field mask mínima) y se aceptan tanto direcciones
 * escritas como coordenadas, así que sirve para las dos medidas que pide la
 * alerta de servicio:
 *   - conductor -> origen (una vez que el conductor tiene su posición);
 *   - origen -> destino (lo que mide el servicio).
 */

import { claveDeGoogle, hayApiDeDirecciones } from './places';

const URL_RUTA = 'https://routes.googleapis.com/directions/v2:computeRoutes';

/** Un extremo de la ruta: dirección escrita o coordenadas. */
export interface Punto {
  address?: string;
  lat?: number | null;
  lng?: number | null;
}

export interface MedidaRuta {
  segundos: number;
  metros: number;
}

/** Caché en memoria: la misma ruta no se vuelve a pedir mientras la app vive. */
const cache = new Map<string, MedidaRuta>();

/** Campos mínimos (menos campos, menos coste). */
export const CAMPOS_RUTA = 'routes.duration,routes.distanceMeters';

export function hayApiDeRutas(): boolean {
  return hayApiDeDirecciones();
}

function comoWaypoint(punto: Punto): Record<string, unknown> {
  if (typeof punto.lat === 'number' && typeof punto.lng === 'number') {
    return { location: { latLng: { latitude: punto.lat, longitude: punto.lng } } };
  }
  return { address: punto.address || '' };
}

/** Cuerpo de la petición (aparte, para poder probarlo sin red). */
export function cuerpoDeRuta(origen: Punto, destino: Punto): Record<string, unknown> {
  return {
    origin: comoWaypoint(origen),
    destination: comoWaypoint(destino),
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    languageCode: 'es',
    units: 'METRIC',
  };
}

function claveDeCache(origen: Punto, destino: Punto): string {
  const p = (x: Punto) =>
    typeof x.lat === 'number' && typeof x.lng === 'number'
      ? `${x.lat.toFixed(5)},${x.lng.toFixed(5)}`
      : (x.address || '').trim().toLowerCase();
  return `${p(origen)} -> ${p(destino)}`;
}

/** "1800s" -> 1800 */
export function segundosDeDuracion(duracion: unknown): number {
  if (typeof duracion === 'number') return duracion;
  if (typeof duracion !== 'string') return 0;
  const segundos = parseFloat(duracion.replace('s', ''));
  return Number.isFinite(segundos) ? segundos : 0;
}

/** Lee la primera ruta de la respuesta de Google. */
export function leerRuta(respuesta: unknown): MedidaRuta | null {
  const datos = respuesta as
    { routes?: { duration?: string; distanceMeters?: number }[] } | null | undefined;
  const ruta = datos?.routes?.[0];
  if (!ruta) return null;
  const segundos = segundosDeDuracion(ruta.duration);
  const metros = Number(ruta.distanceMeters || 0);
  if (segundos <= 0 && metros <= 0) return null;
  return { segundos, metros };
}

/**
 * Texto de la estimación, con el formato de la referencia:
 * "(20 min 6.3 km)" / "(1 min 0.3 km)".
 */
export function formatearEstimacion(medida: MedidaRuta | null): string {
  if (!medida) return '';
  const minutos = Math.max(1, Math.round(medida.segundos / 60));
  const km = medida.metros / 1000;
  const kmTexto = km < 10 ? km.toFixed(1) : String(Math.round(km));
  return `(${minutos} min ${kmTexto} km)`;
}

/** Mide una ruta (con caché). Devuelve null si no hay clave o si falla. */
export async function medirRuta(
  origen: Punto,
  destino: Punto,
  timeoutMs = 8000
): Promise<MedidaRuta | null> {
  if (!hayApiDeRutas()) return null;
  // Cada extremo sirve si tiene coordenadas O dirección escrita (el caso

  // conductor -> origen mezcla las dos cosas).
  const utilizable = (punto: Punto) =>
    Boolean(punto.address?.trim()) ||
    (typeof punto.lat === 'number' && typeof punto.lng === 'number');
  if (!utilizable(origen) || !utilizable(destino)) return null;

  const clave = claveDeCache(origen, destino);
  const guardada = cache.get(clave);
  if (guardada) return guardada;

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    const respuesta = await fetch(URL_RUTA, {
      method: 'POST',
      signal: controlador.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': claveDeGoogle(),
        'X-Goog-FieldMask': CAMPOS_RUTA,
      },
      body: JSON.stringify(cuerpoDeRuta(origen, destino)),
    });
    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.warn(`[routes] ${respuesta.status}: ${detalle.slice(0, 300)}`);
      return null;
    }
    const medida = leerRuta(await respuesta.json());
    if (medida) cache.set(clave, medida);
    return medida;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[routes] error de red:', err);
    return null;
  } finally {
    clearTimeout(temporizador);
  }
}

/** Atajo: directamente el texto "(20 min 6.3 km)". */
export async function estimacionDeRuta(origen: Punto, destino: Punto): Promise<string> {
  return formatearEstimacion(await medirRuta(origen, destino));
}

/** Solo para pruebas: vacía la caché en memoria. */
export function limpiarCacheDeRutas(): void {
  cache.clear();
}
