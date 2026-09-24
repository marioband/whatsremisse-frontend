/**
 * Qué hacer con la respuesta de la API de direcciones (Geocoding v4).
 *
 * Módulo PURO: se prueba en Node sin la app.
 *
 * El candado contra los tiempos falsos: la respuesta dice con qué precisión
 * encontró la dirección (`granularity`). Solo se acepta si es la puerta
 * (ROOFTOP) o un tramo exacto de calle (RANGE_INTERPOLATED). Si es el centro
 * geométrico de la calle o una aproximación (barrio, ciudad), se DESCARTA: es
 * preferible no mostrar tiempo a mostrar uno que apunta a otro sitio.
 *
 * Si Google cambia o no manda la precisión, se descarta también (el silencio es
 * más barato que un dato malo).
 */
export const GRANULARIDADES_EXACTAS: readonly string[] = ['ROOFTOP', 'RANGE_INTERPOLATED'];

/** ¿Google encontró la dirección con precisión de puerta o de tramo de calle? */
export function esDireccionExacta(granularidad?: string | null): boolean {
  return GRANULARIDADES_EXACTAS.includes((granularidad || '').trim().toUpperCase());
}

export interface PuntoResuelto {
  /** Cómo la escribió Google (la dirección formateada). */
  texto: string;
  lat: number;
  lng: number;
}

/**
 * Lee la primera respuesta de Geocoding v4 y devuelve el punto, o null si no
 * sirve. Forma de la respuesta: `{ results: [{ location: {latitude, longitude},
 * granularity, formattedAddress }] }`.
 */
export function leerPuntoResuelto(respuesta: unknown): PuntoResuelto | null {
  const datos = respuesta as {
    results?: {
      location?: { latitude?: number; longitude?: number };
      granularity?: string;
      formattedAddress?: string;
    }[];
  } | null;

  const primero = datos?.results?.[0];
  if (!primero) return null;
  if (!esDireccionExacta(primero.granularity)) return null;

  const lat = primero.location?.latitude;
  const lng = primero.location?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { texto: (primero.formattedAddress || '').trim(), lat, lng };
}
