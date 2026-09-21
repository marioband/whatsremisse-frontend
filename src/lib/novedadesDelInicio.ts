/**
 * Los números de los botones y sub botones del inicio (pedido del usuario, 20-09-2026).
 *
 * LO QUE PIDIÓ: «el contador ya no será un globo en la parte superior derecha, ahora estará al lado
 * del texto dentro del botón, por ejemplo “Disponibles 10” o “En proceso 2” … y en los botones
 * debemos dar la suma de ambas alertas: “Conductor 12” … en el caso de Mis grupos, la suma de los
 * mensajes sin leer de todos los grupos». Y con la aclaración que eligió: los números son
 * **novedades sin ver** —se apagan al entrar al apartado y el botón de arriba baja con ellos—.
 *
 * QUÉ CUENTA CADA UNO (esto es lo que se enseña al usuario en el chat, y está comprobado en su
 * banco de pruebas):
 *   - `disponibles`  : alertas del apartado que llegaron después de la última vez que lo miró.
 *   - `enProceso…`   : servicios en proceso con mensajes sin leer o con la fila cambiada desde
 *                      su última visita (avance del viaje, pago, aceptación).
 *   - `publicados`   : servicios publicados que recibieron postulaciones nuevas desde su visita.
 *   - `misGrupos`    : SUMA de los mensajes sin leer de todos los grupos (`grupos_sin_leer`).
 *
 * Las marcas de «lo miré» viven en el dispositivo, por CUENTA y por apartado (como el resto de
 * marcas del proyecto): cambiar de usuario no arrastra los números del anterior, y al cerrar sesión
 * se van con el resto de la caché (`limpiarCacheCompleta` en `AuthContext`).
 *
 * Las funciones puras van aparte para poder comprobarlas con node sin navegador ni React.
 */
import { guardarCache, leerCache } from './cache';

export type ApartadoDelInicio =
  'disponibles' | 'en-proceso-conductor' | 'publicados' | 'en-proceso-proveedor';

export const APARTADOS_DEL_INICIO: readonly ApartadoDelInicio[] = [
  'disponibles',
  'en-proceso-conductor',
  'publicados',
  'en-proceso-proveedor',
];

/** Sin caducidad: la marca vale hasta que el usuario vuelva a mirar el apartado. */
const SIN_TTL = Number.MAX_SAFE_INTEGER;
const PREFIJO = 'wr:apartado-visto:v1:';

interface MarcaDeApartado {
  cuando: string;
}

/** La clave donde vive la marca de ese apartado para esa cuenta. */
export function claveDeApartado(apartado: ApartadoDelInicio, userId: string): string {
  return `${PREFIJO}${userId || 'sin-cuenta'}:${apartado}`;
}

/**
 * Cuántas novedades hay desde la última visita (puro).
 *
 * Sin marca (`desde` nulo: nunca miró el apartado) cuentan TODAS: es la verdad —no las ha visto— y
 * así el número no miente con un 0 que diría que está todo visto. Cuando toca el botón, la marca
 * pasa a ser «ahora» y el número queda en cero.
 */
export function contarNovedades(
  cuandos: readonly (string | null | undefined)[],
  desde: Date | null
): number {
  if (!desde) return cuandos.length;
  const corte = desde.getTime();
  if (!Number.isFinite(corte)) return cuandos.length;
  return cuandos.filter((cuando) => {
    if (!cuando) return false;
    const t = new Date(cuando).getTime();
    return Number.isFinite(t) && t > corte;
  }).length;
}

/**
 * ¿Esta fecha es novedad respecto a lo último que miró? (puro, para contar «cuántas tarjetas
 * tienen algo nuevo» en vez de sumar cantidades).
 */
export function hayNovedadDesde(cuando: string | null | undefined, desde: Date | null): boolean {
  if (!desde) return true; // nunca miró el apartado: todo es nuevo
  if (!cuando) return false;
  const t = new Date(cuando).getTime();
  return Number.isFinite(t) ? t > desde.getTime() : false;
}

/** El número del botón de arriba: la suma de sus apartados. */
export function sumaDeNovedades(...numeros: number[]): number {
  return numeros.reduce((total, n) => total + (Number.isFinite(n) && n > 0 ? n : 0), 0);
}

/** Cómo se enseña un contador grande (mismo tope que el globo que había antes). */
export function numeroDelBoton(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  return n > 99 ? '99+' : String(n);
}

/**
 * El texto del botón: «Disponibles 10»; sin novedades, solo «Disponibles» (sin espacios de más).
 * Va en UN solo texto, como pidió el usuario (al lado del texto, no un globo encima).
 */
export function textoDelBoton(etiqueta: string, novedades: number): string {
  const numero = numeroDelBoton(novedades);
  return numero ? `${etiqueta} ${numero}` : etiqueta;
}

// ------------------------------------------------------------------ marcas en el dispositivo

/** Se toca el botón del apartado: lo que hay a partir de ahora es «lo que ya miré». */
export async function marcarApartadoVisto(
  apartado: ApartadoDelInicio,
  userId: string
): Promise<void> {
  try {
    await guardarCache(claveDeApartado(apartado, userId), {
      cuando: new Date().toISOString(),
    } satisfies MarcaDeApartado);
  } catch {
    // Sin marca: como antes (el número seguirá contando lo que hay).
  }
}

/** Cuándo miró ese apartado por última vez (null si nunca). */
export async function leerApartadoVisto(
  apartado: ApartadoDelInicio,
  userId: string
): Promise<Date | null> {
  try {
    const marca = await leerCache<MarcaDeApartado>(claveDeApartado(apartado, userId), SIN_TTL);
    if (!marca?.cuando) return null;
    const fecha = new Date(marca.cuando);
    return Number.isFinite(fecha.getTime()) ? fecha : null;
  } catch {
    return null;
  }
}
