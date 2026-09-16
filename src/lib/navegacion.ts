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

import { guardarCache, leerCache } from './cache';

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
