/**
 * Dirección escrita → punto exacto (Geocoding API v4).
 *
 * Para qué: cuando el proveedor escribe su dirección a mano (sin elegir una
 * sugerencia de Google) el servicio se queda SIN coordenadas, y entonces el
 * conductor premium no ve tiempos ni distancias de esa alerta. Aquí se resuelve
 * el texto una sola vez, al crear el servicio, y el punto queda guardado en el
 * propio servicio: la medición, el orden por cercanía y el botón «Ir a origen»
 * usan después ese mismo punto.
 *
 * Reglas de cobro y de datos (verificadas el 24-09-2026):
 *  - Es el SKU de Geocoding (categoría Essentials): ~$5 por 1.000, con 10.000
 *    gratis al mes por SKU. Sale a ~2 céntimos por dirección nueva.
 *  - La llamada la hace el TELÉFONO (la clave de la app tiene restricción por
 *    referer: desde un servidor daría 403).
 *  - Google deja guardar el punto 30 días como máximo, por eso la caché caduca
 *    con el mismo plazo que las rutas entre direcciones (`TTL_RUTA_ENTRE_DIRECCIONES_MS`).
 *  - Si la API no está habilitada o la dirección es dudosa, devuelve null: la app
 *    sigue funcionando igual que antes (sin punto, sin tiempos).
 */

import { guardarCache, leerCache } from './cache';
import { TTL_RUTA_ENTRE_DIRECCIONES_MS } from './geo';
import { normalizarDireccion } from './lugaresFrecuentes';
import { registrarAhorro, registrarLlamada } from './medidor';
import { claveDeGoogle, hayApiDeDirecciones } from './places';
import { leerPuntoResuelto, PuntoResuelto } from './puntoResuelto';

const URL_GEOCODIFICACION = 'https://geocode.googleapis.com/v4/geocode/address';

/** Campos mínimos: el punto, su precisión y la dirección formateada. */
export const CAMPOS_DE_DIRECCION = 'results.location,results.granularity,results.formattedAddress';

/** Menos de esto no es una dirección: no se gasta una llamada. */
const MINIMO_CARACTERES = 5;

/** Clave de caché (una misma dirección escrita de dos formas es la misma entrada). */
export function claveDeCacheDeDireccion(texto: string): string {
  return `direccion:${normalizarDireccion(texto)}`;
}

/**
 * Resuelve el texto a un punto EXACTO (ver `esDireccionExacta`). Devuelve null si
 * no hay clave, si la dirección es ambigua o si Google falla.
 */
export async function resolverDireccion(
  texto: string,
  timeoutMs = 8000
): Promise<PuntoResuelto | null> {
  const limpio = texto.trim();
  if (!hayApiDeDirecciones() || limpio.length < MINIMO_CARACTERES) return null;

  const clave = claveDeCacheDeDireccion(limpio);
  const guardada = await leerCache<PuntoResuelto>(clave, TTL_RUTA_ENTRE_DIRECCIONES_MS);
  if (guardada && typeof guardada.lat === 'number' && typeof guardada.lng === 'number') {
    registrarAhorro('cache');
    return guardada;
  }

  const url = `${URL_GEOCODIFICACION}/${encodeURIComponent(limpio)}?languageCode=es&regionCode=pe`;
  registrarLlamada('google:geocode');
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    const respuesta = await fetch(url, {
      method: 'GET',
      signal: controlador.signal,
      headers: { 'X-Goog-Api-Key': claveDeGoogle(), 'X-Goog-FieldMask': CAMPOS_DE_DIRECCION },
    });
    if (!respuesta.ok) {
      // Se registra el motivo real (API sin habilitar, clave sin permiso, cuota).
      const detalle = await respuesta.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.warn(`[direcciones] ${respuesta.status}: ${detalle.slice(0, 300)}`);
      return null;
    }
    const punto = leerPuntoResuelto(await respuesta.json());
    if (!punto) return null;
    await guardarCache(clave, punto);
    return punto;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[direcciones] error de red:', err);
    return null;
  } finally {
    clearTimeout(temporizador);
  }
}
