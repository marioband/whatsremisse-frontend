/**
 * Marca de "el conductor ya cumplió la orden de tocar para iniciar".
 *
 * Regla del usuario: el toque de la tarjeta **no reporta ningún hito** —el conductor
 * todavía no se ha dirigido al punto de origen, así que "Ubicado" no tiene sentido—;
 * solo mueve la tarjeta del apartado "Todos" al apartado "En proceso". El hito
 * "Ubicado" lo activa el conductor cuando desliza la barra dentro del chat, ya en el
 * origen.
 *
 * Como no hay columna para esto en la base (y no se quiere una migración para un
 * detalle de orden en la pantalla), la marca vive en el dispositivo, en la caché
 * persistente que ya existe (`lib/cache.ts`): sobrevive a recargar la app y se
 * olvida sola a los 24 h para no arrastrar servicios viejos (el `service_id` se
 * reutiliza cuando el proveedor edita la tarjeta).
 *
 * La marca incluye al conductor: en el mismo navegador se cambia de cuenta a menudo
 * (teléfono + contraseña), y el toque de un conductor no debe mover la tarjeta de otro.
 */

import { guardarCache, leerCache } from './cache';

export const CLAVE_INICIOS = 'conductor:inicio-de-viaje';

/** Cuánto vale el toque (el viaje de ese día). Pasado ese plazo, caduca solo. */
export const VIGENCIA_DEL_TOQUE_MS = 24 * 60 * 60 * 1000;

/** Sin vencimiento propio: el plazo lo decide `yaInicio` (24 h). */
const SIN_TTL = -1;

export interface InicioDelViaje {
  /** Conductor que tocó la tarjeta. */
  conductor: string;
  /** Cuándo se tocó (ISO 8601). */
  cuando: string;
}

export type IniciosDelViaje = Record<string, InicioDelViaje>;

/** Lee las marcas guardadas en el dispositivo (mapa serviceId → toque). */
export async function leerIniciosDelViaje(): Promise<IniciosDelViaje> {
  return (await leerCache<IniciosDelViaje>(CLAVE_INICIOS, SIN_TTL)) ?? {};
}

/** Guarda el mapa (silencioso si el almacén falla: nunca rompe la pantalla). */
export async function guardarIniciosDelViaje(inicios: IniciosDelViaje): Promise<void> {
  await guardarCache(CLAVE_INICIOS, inicios);
}

/** Mapa con el toque de este conductor para ese servicio (puro, para probar). */
export function marcarInicio(
  inicios: IniciosDelViaje,
  serviceId: string,
  conductor: string,
  cuando = new Date().toISOString()
): IniciosDelViaje {
  return { ...inicios, [serviceId]: { conductor, cuando } };
}

/** ¿Este conductor ya cumplió el toque de inicio en ese servicio? */
export function yaInicio(
  inicios: IniciosDelViaje,
  serviceId: string,
  conductor: string,
  ahora = Date.now()
): boolean {
  const marca = inicios[serviceId];
  if (!marca) return false;
  if (!conductor || marca.conductor !== conductor) return false;
  const cuando = new Date(marca.cuando).getTime();
  if (!Number.isFinite(cuando)) return false;
  return ahora - cuando < VIGENCIA_DEL_TOQUE_MS;
}
