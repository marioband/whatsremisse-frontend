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

import { leerCache, guardarCache, limpiarCacheConPrefijo } from './cache';
import {
  redondearCoordenada,
  TTL_RUTA_CON_POSICION_MS,
  TTL_RUTA_ENTRE_DIRECCIONES_MS,
} from './geo';
import { registrarAhorro, registrarLlamada, registrarResumenEnConsola } from './medidor';
import { preferenciaDeRuta } from './horasPunta';
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

/**
 * Preferencia de ruta: cambia el precio (y la calidad del dato).
 *  - 'TRAFFIC_UNAWARE' -> SKU **Essentials** (Compute Routes: $5 por 1000, 10.000 gratis).
 *  - 'TRAFFIC_AWARE'   -> SKU **Pro** ($10 por 1000, 5.000 gratis): cuenta el tráfico real.
 *
 * DECISIÓN DEL USUARIO (24-09-2026): no se elige una para siempre — se pide la CARA solo cuando el
 * tráfico decide (horas punta de Lima) y la BARATA el resto del día. Vive en `lib/horasPunta.ts`,
 * que es donde se ajustan las franjas.
 */

export function hayApiDeRutas(): boolean {
  return hayApiDeDirecciones();
}

function comoWaypoint(punto: Punto): Record<string, unknown> {
  if (typeof punto.lat === 'number' && typeof punto.lng === 'number') {
    return { location: { latLng: { latitude: punto.lat, longitude: punto.lng } } };
  }
  return { address: punto.address || '' };
}

/**
 * Deja el punto en la forma que se va a usar (y a cachear).
 *
 * Las coordenadas se redondean a bloques de 500 m: mientras el conductor se
 * mueve dentro del mismo bloque la medida se reutiliza, así que una posición GPS
 * que cambia cada pocos metros NO genera una llamada nueva. La dirección se
 * normaliza (sin espacios de más) para que la misma dirección comparta entrada.
 */
function normalizarPunto(punto: Punto): Punto {
  if (typeof punto.lat === 'number' && typeof punto.lng === 'number') {
    const redondeada = redondearCoordenada({ lat: punto.lat, lng: punto.lng });
    return { lat: redondeada.lat, lng: redondeada.lng };
  }
  return { address: (punto.address || '').trim() };
}

/** ¿Alguno de los extremos es la posición del conductor? (caduca rápido) */
function llevaPosicion(punto: Punto): boolean {
  return typeof punto.lat === 'number' && typeof punto.lng === 'number';
}

/** Cuerpo de la petición (aparte, para poder probarlo sin red). */
export function cuerpoDeRuta(
  origen: Punto,
  destino: Punto,
  preferencia: 'TRAFFIC_UNAWARE' | 'TRAFFIC_AWARE' = preferenciaDeRuta()
): Record<string, unknown> {
  return {
    origin: comoWaypoint(origen),
    destination: comoWaypoint(destino),
    travelMode: 'DRIVE',
    routingPreference: preferencia,
    languageCode: 'es',
    units: 'METRIC',
  };
}

function claveDeCache(
  origen: Punto,
  destino: Punto,
  preferencia: 'TRAFFIC_UNAWARE' | 'TRAFFIC_AWARE'
): string {
  const p = (x: Punto) =>
    typeof x.lat === 'number' && typeof x.lng === 'number'
      ? `${x.lat.toFixed(5)},${x.lng.toFixed(5)}`
      : (x.address || '').trim().toLowerCase();
  // La tarifa forma parte de la clave: `sin trafico|...` y `con trafico|...` son medidas distintas.
  return `${preferencia}|${p(origen)} -> ${p(destino)}`;
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

/**
 * Mide una ruta reutilizando todo lo posible.
 *
 * Orden: memoria -> caché persistente (sobrevive a recargar) -> Google. Las
 * medidas que dependen de la posición del conductor caducan a los 5 minutos; las
 * que son entre dos direcciones (fijas para un servicio) duran 30 días.
 */
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

  const origenListo = normalizarPunto(origen);
  const destinoListo = normalizarPunto(destino);
  // La preferencia se decide AHORA (horas punta de Lima) y forma parte de la clave: una medida sin
  // tráfico no puede reutilizarse en hora punta (el conductor vería un tiempo irreal).
  const preferencia = preferenciaDeRuta();
  const clave = claveDeCache(origenListo, destinoListo, preferencia);
  // Un tiempo CON tráfico es un dato vivo: se guarda minutos. Sin tráfico es una ruta fija y
  // aguanta el TTL largo de siempre (30 días si son dos direcciones).
  const ttl =
    preferencia === 'TRAFFIC_AWARE' || llevaPosicion(origenListo) || llevaPosicion(destinoListo)
      ? TTL_RUTA_CON_POSICION_MS
      : TTL_RUTA_ENTRE_DIRECCIONES_MS;

  const enMemoria = cache.get(clave);
  if (enMemoria) {
    registrarAhorro('cache');
    return enMemoria;
  }

  const persistida = await leerCache<MedidaRuta>(`ruta:${clave}`, ttl);
  if (persistida) {
    cache.set(clave, persistida);
    registrarAhorro('cache');
    return persistida;
  }

  // El contador de llamadas distingue las dos tarifas: así el gasto de rutas se puede mirar
  // separado (con tráfico = Pro; sin tráfico = Essentials, la mitad).
  registrarLlamada(
    preferencia === 'TRAFFIC_AWARE'
      ? 'routes:computeRoutes:conTrafico'
      : 'routes:computeRoutes:sinTrafico'
  );
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
      body: JSON.stringify(cuerpoDeRuta(origenListo, destinoListo, preferencia)),
    });
    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.warn(`[routes] ${respuesta.status}: ${detalle.slice(0, 300)}`);
      return null;
    }
    const medida = leerRuta(await respuesta.json());
    if (medida) {
      cache.set(clave, medida);
      guardarCache(`ruta:${clave}`, medida);
      registrarResumenEnConsola();
    }
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

/** Solo para pruebas: vacía la caché en memoria y la persistente de rutas. */
export function limpiarCacheDeRutas(): void {
  cache.clear();
  limpiarCacheConPrefijo('ruta:');
}
