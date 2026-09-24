/**
 * Cálculos propios de distancia (gratis) para decidir ANTES de gastar una
 * llamada a Google.
 *
 * Regla del proyecto: primero lo nuestro, después la base de datos, después la
 * caché y solo al final una API externa. Este módulo resuelve "¿está lejos?"
 * con matemática: sirve para descartar candidatos, nunca para mostrar un número
 * exacto (haversine ignora las calles y da ±10-20 % frente a la distancia real).
 */

export interface Coordenada {
  lat: number;
  lng: number;
}

/** Radio medio de la Tierra en metros. */
const RADIO_TIERRA_M = 6371008.8;
const METROS_POR_GRADO = 111320;

/** Configuración del filtro y de la reutilización de medidas. */
/**
 * Hasta dónde se le pide al conductor «cuánto tardas en llegar al origen». Antes 5 km: en una
 * ciudad como Lima eso dejaba la tarjeta SIN tiempo ni distancia casi siempre (lo reportó el
 * usuario el 21-09-2026). 15 km cubre la ciudad sin disparar las llamadas, porque ESTA es la
 * medida que se recalcula cuando el conductor se mueve (la del viaje origen→destino se mide
 * aparte y queda cacheada 30 días).
 */
export const RADIO_FILTRO_METROS = 15000;
export const UMBRAL_MOVIMIENTO_METROS = 500; // "no se movió lo suficiente"
export const MAXIMO_CANDIDATOS_ETA = 5; // a cuántos se les pide ETA exacta
export const TTL_RUTA_CON_POSICION_MS = 5 * 60 * 1000; // 5 min
export const TTL_RUTA_ENTRE_DIRECCIONES_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

const aRadianes = (grados: number) => (grados * Math.PI) / 180;

/**
 * Distancia en línea recta entre dos coordenadas (haversine).
 * Es una aproximación: no sigue las calles. Para filtrar sobra.
 */
export function distanciaLinealMetros(a: Coordenada, b: Coordenada): number {
  const dLat = aRadianes(b.lat - a.lat);
  const dLng = aRadianes(b.lng - a.lng);
  const lat1 = aRadianes(a.lat);
  const lat2 = aRadianes(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "1.2 km" / "850 m" para textos aproximados (siempre con sentido de escala). */
export function formatearDistanciaAproximada(metros: number): string {
  if (!Number.isFinite(metros) || metros <= 0) return '0 m';
  if (metros < 1000) return `${Math.round(metros)} m`;
  const km = metros / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** Texto con el símbolo de aproximado, para que nunca se confunda con Google. */
export function formatearAproximado(metros: number): string {
  return `≈ ${formatearDistanciaAproximada(metros)}`;
}

/** ¿El punto está dentro del radio? (el filtro barato antes de Routes) */
export function dentroDelRadio(
  centro: Coordenada,
  punto: Coordenada,
  radioMetros: number = RADIO_FILTRO_METROS
): boolean {
  return distanciaLinealMetros(centro, punto) <= radioMetros;
}

/**
 * Redondea una coordenada a un bloque de N metros.
 *
 * Se usa para la clave de caché y para la propia petición: mientras el
 * conductor se mueve dentro del mismo bloque (por defecto 500 m) la medida se
 * reutiliza, que es justo lo que pide la regla de "no consultar por cada
 * actualización de GPS". Cambia la ETA menos de un minuto.
 */
export function redondearCoordenada(
  valor: Coordenada,
  metros = UMBRAL_MOVIMIENTO_METROS
): Coordenada {
  const paso = metros / METROS_POR_GRADO;
  const redondear = (grados: number) => Math.round(grados / paso) * paso;
  return {
    // Se recorta a 6 decimales (~10 cm) para no arrastrar ruido de coma flotante.
    lat: Number(redondear(valor.lat).toFixed(6)),
    lng: Number(redondear(valor.lng).toFixed(6)),
  };
}

/** ¿Se movió lo suficiente como para valer una medida nueva? */
export function seMovioLoSuficiente(
  anterior: Coordenada | null,
  actual: Coordenada,
  umbralMetros = UMBRAL_MOVIMIENTO_METROS
): boolean {
  if (!anterior) return true;
  return distanciaLinealMetros(anterior, actual) >= umbralMetros;
}

/** ¿Pasó demasiado tiempo desde el último cálculo? */
export function vencióLaMedida(
  ultimoCalculo: number | null,
  ahora = Date.now(),
  ttlMs = TTL_RUTA_CON_POSICION_MS
): boolean {
  if (!ultimoCalculo) return true;
  return ahora - ultimoCalculo >= ttlMs;
}

/** Centro aproximado de un conjunto de coordenadas (para el sesgo de búsqueda). */
export function centroAproximado(puntos: Coordenada[]): Coordenada | null {
  const validos = puntos.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (validos.length === 0) return null;
  const suma = validos.reduce(
    (acumulado, p) => ({ lat: acumulado.lat + p.lat, lng: acumulado.lng + p.lng }),
    { lat: 0, lng: 0 }
  );
  return { lat: suma.lat / validos.length, lng: suma.lng / validos.length };
}

export interface ConCoordenadas {
  origen: Coordenada | null;
}

/**
 * Elige a qué servicios merece la pena pedirles una ETA exacta: los más
 * cercanos al conductor que además tengan coordenadas de origen. El resto se
 * descarta con nuestro propio cálculo (coste 0).
 */
export function elegirCandidatosPorCercania<T extends ConCoordenadas>(
  posicion: Coordenada | null,
  servicios: T[],
  maximo = MAXIMO_CANDIDATOS_ETA,
  radioMetros = RADIO_FILTRO_METROS
): { candidatos: T[]; descartados: T[]; sinCoordenadas: T[] } {
  if (!posicion) {
    // Sin posición no hay filtro posible: se limita la cantidad y ya.
    return { candidatos: servicios.slice(0, maximo), descartados: [], sinCoordenadas: [] };
  }

  const conCoordenadas: { servicio: T; metros: number }[] = [];
  const sinCoordenadas: T[] = [];
  servicios.forEach((servicio) => {
    if (!servicio.origen) {
      sinCoordenadas.push(servicio);
      return;
    }
    conCoordenadas.push({ servicio, metros: distanciaLinealMetros(posicion, servicio.origen) });
  });

  conCoordenadas.sort((a, b) => a.metros - b.metros);
  const candidatos = conCoordenadas
    .filter((entrada) => entrada.metros <= radioMetros)
    .slice(0, maximo)
    .map((entrada) => entrada.servicio);
  const descartados = conCoordenadas
    .filter((entrada) => !candidatos.includes(entrada.servicio))
    .map((entrada) => entrada.servicio);

  return { candidatos, descartados, sinCoordenadas };
}
