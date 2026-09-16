/**
 * Huella de la alerta y marca local de MI postulación.
 *
 * Para qué: la regla del usuario dice que un conductor rechazado **ya no ve el
 * servicio**, "a menos que el proveedor edite el servicio" (esa edición descarta la
 * cola vieja: migración 0016). El problema es que el estado de la fila de
 * `applications` es REJECTED en los dos casos, así que hay que distinguir *por qué*:
 *
 *   1. El proveedor me rechazó      → el rechazo sigue en pie: la tarjeta se va.
 *   2. El proveedor editó la alerta → la cola se descartó: puedo volver a postularme.
 *
 * Comparar tiempos NO sirve: rechazar también escribe en `service_alerts` (la
 * aplicación la reabre con `status`/`assigned_driver_id`), así que `updated_at`
 * siempre queda después de mi postulación — eso hacía que TODO rechazo pareciera una
 * edición y la tarjeta se mostrara como disponible, sin el mensaje (fallo reportado
 * por el usuario, comprobado contra su backend real).
 *
 * La solución es la HUELLA de los campos que el proveedor puede editar: la misma
 * lista que usa el trigger de la 0016 para limpiar la cola (`title`, `description`,
 * origen y destino, `vehicle_requirements`, `fare`, `scheduled_at`, `group_id` y los
 * datos de pago del proveedor). Si la huella de ahora es la misma que la que tenía la
 * alerta cuando me postulé, nadie editó nada: el rechazo sigue en pie. Si cambió,
 * hubo edición y la tarjeta vuelve a estar disponible para mí.
 *
 * La huella se guarda en el dispositivo (caché persistente, como la marca del toque
 * de inicio) porque no hay columna para esto y no se quiere otra migración.
 */

import { ServiceAlert } from '../types';
import { guardarCache, leerCache } from './cache';

export const CLAVE_POSTULACIONES = 'conductor:huella-de-postulacion';

/** Sin vencimiento propio: la marca se refresca en cada postulación. */
const SIN_TTL = -1;

export interface MarcaDePostulacion {
  /** Conductor que se postuló (en el mismo navegador se cambia de cuenta a menudo). */
  conductor: string;
  /** Huella de la alerta en el momento de postularse. */
  huella: string;
}

export type HuellasDePostulacion = Record<string, MarcaDePostulacion>;

/**
 * Huella de los campos EDITABLES de la alerta (los mismos que vigila la 0016).
 *
 * Deja fuera a propósito `status`, `assigned_driver_id`, `driver_progress_step`,
 * `pago_*` y `updated_at`: son el estado del viaje, no una edición. Es justo la
 * distinción que necesita la regla del rechazo.
 */
export function huellaDeLaAlerta(service: ServiceAlert): string {
  const requisitos = (service.vehicle_requirements ?? {}) as Record<string, unknown>;
  const requisitosClave = Object.keys(requisitos)
    .sort()
    .map((clave) => `${clave}=${String(requisitos[clave] ?? '')}`)
    .join('|');
  const campo = (valor: unknown) => String(valor ?? '');

  return [
    campo(service.title),
    campo(service.description),
    campo(service.origin_address),
    campo(service.origin_lat),
    campo(service.origin_lng),
    campo(service.destination_address),
    campo(service.destination_lat),
    campo(service.destination_lng),
    requisitosClave,
    campo(service.fare),
    campo(service.scheduled_at),
    campo(service.group_id),
    campo(service.provider_yape),
    campo(service.provider_bcp_account),
    campo(service.provider_bcp_cci),
  ].join('||');
}

/** Lee las huellas guardadas en el dispositivo. */
export async function leerHuellasDePostulacion(): Promise<HuellasDePostulacion> {
  return (await leerCache<HuellasDePostulacion>(CLAVE_POSTULACIONES, SIN_TTL)) ?? {};
}

/** Guarda el mapa (silencioso si el almacén falla: nunca rompe la pantalla). */
export async function guardarHuellasDePostulacion(huellas: HuellasDePostulacion): Promise<void> {
  await guardarCache(CLAVE_POSTULACIONES, huellas);
}

/** Mapa con la huella de ESTA postulación (puro, para poder probarlo con node). */
export function marcarPostulacion(
  huellas: HuellasDePostulacion,
  serviceId: string,
  conductor: string,
  service: ServiceAlert
): HuellasDePostulacion {
  return { ...huellas, [serviceId]: { conductor, huella: huellaDeLaAlerta(service) } };
}

/** Huella que tenía la alerta cuando me postulé (undefined si no hay marca). */
export function huellaDeMiPostulacion(
  huellas: HuellasDePostulacion,
  serviceId: string,
  conductor: string
): string | undefined {
  const marca = huellas[serviceId];
  if (!marca || !conductor || marca.conductor !== conductor) return undefined;
  return marca.huella;
}
