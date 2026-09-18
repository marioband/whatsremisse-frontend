/**
 * Con qué app se abren las rutas de los servicios (Ajustes → Navegación).
 *
 * El conductor tendrá un botón para abrir la ruta al punto de origen (o al destino)
 * y el usuario elige desde Cuenta si eso se abre en Google Maps o en Waze. La
 * elección se guarda en el dispositivo (caché persistente, como los demás ajustes
 * locales: no hay columna para esto y no se quiere una migración).
 *
 * La selección es **excluyente**: siempre hay exactamente una app activa, por
 * defecto Waze (regla del usuario).
 */

import { guardarCache, leerCache, borrarDeCache } from './cache';
import { ServiceAlert } from '../types';

export type AppDeNavegacion = 'GOOGLE_MAPS' | 'WAZE';

export const CLAVE_NAVEGACION = 'ajustes:app-de-navegacion';

/** Sin vencimiento propio: es un ajuste, no una medida con caducidad. */
const SIN_TTL = -1;

/** Por defecto: Waze (regla del usuario). */
export const APP_DE_NAVEGACION_POR_DEFECTO: AppDeNavegacion = 'WAZE';

/** Orden en pantalla: Google Maps primero, Waze después. */
export const APPS_DE_NAVEGACION: { id: AppDeNavegacion; etiqueta: string }[] = [
  { id: 'GOOGLE_MAPS', etiqueta: 'Google Maps' },
  { id: 'WAZE', etiqueta: 'Waze' },
];

/**
 * Colores del interruptor del selector (fijados por el usuario el 18-09-2026): al
 * activarlo, la **barra va en `#B8BED8`** y el **círculo en el azul institucional**
 * (`#3F51B5`). Antes el selector era el `Switch` del sistema, que pintaba la barra con
 * `trackColor` pero el círculo lo dibujaba el navegador (se veía verde), así que la
 * tarjeta se pinta a mano y los colores salen de aquí.
 */
export const COLORES_DEL_INTERRUPTOR = {
  apagado: { pista: '#CCCCCC', circulo: '#FFFFFF' },
  encendido: { pista: '#B8BED8', circulo: '#3F51B5' },
} as const;

export function coloresDelInterruptor(encendido: boolean) {
  return encendido ? COLORES_DEL_INTERRUPTOR.encendido : COLORES_DEL_INTERRUPTOR.apagado;
}

export function etiquetaDeApp(app: AppDeNavegacion): string {
  return APPS_DE_NAVEGACION.find((a) => a.id === app)?.etiqueta ?? 'Waze';
}

export function esAppDeNavegacion(valor: unknown): valor is AppDeNavegacion {
  return valor === 'GOOGLE_MAPS' || valor === 'WAZE';
}

/**
 * Qué queda seleccionado después de tocar un interruptor.
 *
 * - Encender una app selecciona ESA (la otra se apaga sola: son excluyentes).
 * - Apagar la que está activa no deja al usuario sin app: se queda como estaba.
 */
export function nuevaSeleccion(
  actual: AppDeNavegacion,
  tocada: AppDeNavegacion,
  encendida: boolean
): AppDeNavegacion {
  if (!encendida) return actual;
  return tocada;
}

/** Lee la preferencia del dispositivo (Waze si no hay nada guardado). */
export async function leerAppDeNavegacion(): Promise<AppDeNavegacion> {
  const guardada = await leerCache<unknown>(CLAVE_NAVEGACION, SIN_TTL);
  return esAppDeNavegacion(guardada) ? guardada : APP_DE_NAVEGACION_POR_DEFECTO;
}

/** Guarda la preferencia (silencioso si el almacén falla). */
export async function guardarAppDeNavegacion(app: AppDeNavegacion): Promise<void> {
  await guardarCache(CLAVE_NAVEGACION, app);
}

// ---------------------------------------------------------------------------------
// Botón de navegación del conductor: origen → destinos, en el orden del viaje
// ---------------------------------------------------------------------------------

/** Etiqueta con la que se nombra cada parada dentro del ciclo del botón. */
export const ETIQUETA_ORIGEN = 'Ir a origen';
export const ETIQUETA_DESTINO = 'Ir a destino';

/** Una parada del viaje: el origen, una parada intermedia o el destino final. */
export interface ParadaDeNavegacion {
  /** 0 = origen; 1..n = destinos, en el orden en que se recorren. */
  posicion: number;
  esOrigen: boolean;
  direccion: string;
  lat: number | null;
  lng: number | null;
}

/**
 * `lat`/`lng` valen 0 cuando el proveedor escribió la dirección sin elegir una
 * sugerencia (así las guarda `construirServicio`), y 0,0 está en el golfo de Guinea:
 * para navegar hay que usar entonces el TEXTO de la dirección.
 */
export function tieneCoordenadas(parada: { lat: number | null; lng: number | null }): boolean {
  const { lat, lng } = parada;
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return !(lat === 0 && lng === 0);
}

/**
 * Las paradas intermedias viajan dentro de `observations` como "Paradas: A, B"
 * (ver `construirServicio`): la base solo tiene UN destino con coordenadas, así que
 * las paradas se navegan por su dirección escrita.
 */
export function paradasDeLasObservaciones(observaciones?: string[] | null): string[] {
  const fila = (observaciones ?? []).find((o) => /^paradas\s*:/i.test(o.trim()));
  if (!fila) return [];
  return fila
    .replace(/^paradas\s*:/i, '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
}

/** Origen + destinos, en el orden del viaje (las paradas antes del destino final). */
export function paradasDelServicio(service: ServiceAlert): ParadaDeNavegacion[] {
  const origen: ParadaDeNavegacion = {
    posicion: 0,
    esOrigen: true,
    direccion: service.origin_address || '',
    lat: service.origin_lat ?? null,
    lng: service.origin_lng ?? null,
  };
  const intermedias: ParadaDeNavegacion[] = paradasDeLasObservaciones(service.observations).map(
    (direccion, i) => ({ posicion: i + 1, esOrigen: false, direccion, lat: null, lng: null })
  );
  const destino: ParadaDeNavegacion = {
    posicion: intermedias.length + 1,
    esOrigen: false,
    direccion: service.destination_address || '',
    lat: service.destination_lat ?? null,
    lng: service.destination_lng ?? null,
  };
  return [origen, ...intermedias, destino];
}

/**
 * Texto del botón para la parada actual:
 *   índice 0 → "Ir a origen"
 *   un solo destino → "Ir a destino"
 *   dos o más destinos → "Ir a Destino 1", "Ir a Destino 2", …
 */
export function etiquetaDelBoton(paradas: ParadaDeNavegacion[], indice: number): string {
  if (indice <= 0 || paradas.length === 0) return ETIQUETA_ORIGEN;
  const destinos = Math.max(paradas.length - 1, 1);
  if (destinos === 1) return ETIQUETA_DESTINO;
  const posicion = Math.min(indice, destinos);
  return `Ir a Destino ${posicion}`;
}

/** El hito que abre el destino: "Conductor en el punto de origen (Ubicado)". */
export const PASO_UBICADO = 1;

/** ¿El conductor ya reportó que está en el origen? (lo que abre el botón de destino). */
export function viajeReportadoComoUbicado(servicio: {
  driver_progress_step?: number | null;
}): boolean {
  return (servicio?.driver_progress_step ?? 0) >= PASO_UBICADO;
}

/**
 * Qué parada ofrece el botón AHORA.
 *
 * Lo decide el REPORTE del viaje, no las pulsaciones anteriores (regla del usuario,
 * 18-09-2026): "el botón de ir a destino está condicionado a que antes se debe haber
 * presionado el botón ir a origen, eso no debe ser así, el botón debe estar condicionado
 * al reporte del conductor cuando desliza ubicado".
 *
 *   * Sin reportar "Ubicado": el botón ofrece el ORIGEN (y sigue en el origen aunque se
 *     pulse, porque el destino todavía no toca).
 *   * Reportado: ofrece el primer destino sin haber tenido que pulsar "Ir a origen"; a
 *     partir de ahí la marca de las pulsaciones manda (avanza por las paradas y, tras la
 *     última, vuelve al origen).
 */
export function indiceDelBoton(
  paradas: ParadaDeNavegacion[],
  reportado: boolean,
  marca: number | null
): number {
  if (paradas.length === 0) return 0;
  if (!reportado) return 0;
  if (marca !== null && marca > 0) return Math.min(marca, paradas.length - 1);
  if (marca === 0) return 0; // dio la vuelta al ciclo: le toca el origen
  return paradas.length > 1 ? 1 : 0;
}

/** Después de la última parada el botón vuelve al origen (el viaje recomienza). */
export function indiceSiguiente(paradas: ParadaDeNavegacion[], indice: number): number {
  if (paradas.length === 0) return 0;
  return (Math.min(indice, paradas.length - 1) + 1) % paradas.length;
}

/** Enlace para abrir la ruta en la app elegida (coordenadas si las hay, si no el texto). */
export function urlDeNavegacion(app: AppDeNavegacion, parada: ParadaDeNavegacion): string {
  const destino = tieneCoordenadas(parada)
    ? `${parada.lat},${parada.lng}`
    : encodeURIComponent(parada.direccion);
  if (app === 'GOOGLE_MAPS') {
    return `https://www.google.com/maps/dir/?api=1&destination=${destino}&travelmode=driving`;
  }
  return tieneCoordenadas(parada)
    ? `https://waze.com/ul?ll=${destino}&navigate=yes`
    : `https://waze.com/ul?q=${destino}&navigate=yes`;
}

// ---------------------------------------------------------------------------------
// En qué parada se quedó el conductor (marca del dispositivo, por servicio)
// ---------------------------------------------------------------------------------

export const CLAVE_PARADAS = 'conductor:parada-de-navegacion';

/** El viaje de ese día: pasado ese plazo la marca caduca sola. */
export const VIGENCIA_DE_LA_PARADA_MS = 24 * 60 * 60 * 1000;

export interface MarcaDeParada {
  /** Conductor que pulsó el botón (en el mismo navegador se cambia de cuenta). */
  conductor: string;
  /** Índice de la parada que TOCA la próxima vez. */
  indice: number;
  cuando: string;
}

export type ParadasDeNavegacion = Record<string, MarcaDeParada>;

export async function leerParadasDeNavegacion(): Promise<ParadasDeNavegacion> {
  return (await leerCache<ParadasDeNavegacion>(CLAVE_PARADAS, SIN_TTL)) ?? {};
}

export async function guardarParadasDeNavegacion(paradas: ParadasDeNavegacion): Promise<void> {
  await guardarCache(CLAVE_PARADAS, paradas);
}

/** Marca la próxima parada de ese servicio para ese conductor (puro, para probar). */
export function marcarParada(
  paradas: ParadasDeNavegacion,
  serviceId: string,
  conductor: string,
  indice: number,
  cuando = new Date().toISOString()
): ParadasDeNavegacion {
  return { ...paradas, [serviceId]: { conductor, indice, cuando } };
}

/** Índice guardado (0 si no hay marca, es de otro conductor o ya caducó). */
export function indiceGuardado(
  paradas: ParadasDeNavegacion,
  serviceId: string,
  conductor: string,
  ahora = Date.now()
): number {
  return marcaDeParada(paradas, serviceId, conductor, ahora) ?? 0;
}

/**
 * La marca tal cual: `null` es "no hay marca" (nunca se pulsó), que NO es lo mismo que
 * una marca en 0 (el conductor dio la vuelta al ciclo y le toca el origen).
 */
export function marcaDeParada(
  paradas: ParadasDeNavegacion,
  serviceId: string,
  conductor: string,
  ahora = Date.now()
): number | null {
  const marca = paradas[serviceId];
  if (!marca) return null;
  if (!conductor || marca.conductor !== conductor) return null;
  const cuando = new Date(marca.cuando).getTime();
  if (!Number.isFinite(cuando) || ahora - cuando >= VIGENCIA_DE_LA_PARADA_MS) return null;
  return Number.isInteger(marca.indice) && marca.indice >= 0 ? marca.indice : null;
}

// ---------------------------------------------------------------------------------
// Volver al chat desde el que se abrió la ruta
// ---------------------------------------------------------------------------------

/**
 * El botón de navegación abre Waze en OTRA pestaña (medido: la app no se descarga), pero
 * al volver el navegador del teléfono puede recargar la pestaña: el conductor veía
 * "estado de inicio cargando el logo" y perdía el chat. El propio botón deja aquí una
 * marca con el servicio y la pantalla de inicio se la lleva una sola vez para devolverlo
 * a ese chat. Caduca pronto a propósito: no se secuestra la app al abrirla más tarde.
 */
export const CLAVE_CHAT_DE_VUELTA = 'conductor:chat-de-vuelta';
export const VIGENCIA_DEL_CHAT_DE_VUELTA_MS = 10 * 60 * 1000;

export interface MarcaDeVuelta {
  serviceId: string;
  cuando: string;
}

/** ¿La marca sigue valiendo? (puro, para probar con node) */
export function marcaDeVueltaVigente(
  marca: MarcaDeVuelta | null | undefined,
  ahora = Date.now()
): boolean {
  if (!marca || !marca.serviceId) return false;
  const cuando = new Date(marca.cuando).getTime();
  if (!Number.isFinite(cuando)) return false;
  const transcurrido = ahora - cuando;
  return transcurrido >= 0 && transcurrido < VIGENCIA_DEL_CHAT_DE_VUELTA_MS;
}

/** Deja la marca de "estaba en este chat" (no puede impedir abrir la ruta si falla). */
export async function marcarChatDeVuelta(serviceId: string): Promise<void> {
  try {
    await guardarCache(CLAVE_CHAT_DE_VUELTA, {
      serviceId,
      cuando: new Date().toISOString(),
    } satisfies MarcaDeVuelta);
  } catch {
    // Sin marca: como antes.
  }
}

/** El servicio al que hay que volver, o null. NO la consume: la consume `limpiar`. */
export async function leerChatDeVuelta(): Promise<string | null> {
  try {
    const marca = await leerCache<MarcaDeVuelta>(CLAVE_CHAT_DE_VUELTA, SIN_TTL);
    return marcaDeVueltaVigente(marca) ? (marca as MarcaDeVuelta).serviceId : null;
  } catch {
    return null;
  }
}

export async function limpiarChatDeVuelta(): Promise<void> {
  try {
    await borrarDeCache(CLAVE_CHAT_DE_VUELTA);
  } catch {
    // Nada: la marca caduca sola.
  }
}
