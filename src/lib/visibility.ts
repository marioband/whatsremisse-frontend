import { ServiceAlert } from '../types';
import { estaVencido } from './estadoServicio';
import { gruposDeServicio } from './gruposDeServicio';

/**
 * Reglas de visibilidad de los servicios, en un solo lugar para que las dos
 * pestanas del inicio y el canal de tiempo real no se contradigan.
 *
 * - Proveedor: solo ve los servicios que publico el mismo.
 * - Conductor: ve las alertas abiertas que se compartieron a alguno de sus
 *   grupos, mas las que ya tiene asignadas. Nunca las suyas de proveedor.
 *
 * - Alertas caducadas: se cierran solas (20 minutos desde su emisión si son "al
 *   momento"; 10 minutos DESPUÉS de la hora si tienen hora específica, reservas
 *   incluidas). El conductor deja de verlas al cerrarse y el proveedor las conserva
 *   24 h para editarlas y reenviarlas.
 */

/** true si el servicio lo publico este usuario como proveedor. */
export function isMineAsProvider(service: ServiceAlert, userId?: string | null): boolean {
  return !!userId && service.provider_id === userId;
}

/** Visibilidad en la pestana Proveedor. */
export function isVisibleAsProvider(service: ServiceAlert, userId?: string | null): boolean {
  return isMineAsProvider(service, userId);
}

/** Visibilidad en la pestana Conductor. */
export function isVisibleAsDriver(
  service: ServiceAlert,
  userId: string | undefined | null,
  groupIds: readonly string[],
  /**
   * Las emergencias cercanas que este conductor pidió recibir (0041/0042). Son de grupos a los que
   * no pertenece, así que sin esto no pasarían; quién entra en la lista lo decide
   * `lib/emergencias.ts` (premium + activado + dentro de 15 km).
   */
  emergenciasCerca?: readonly string[]
): boolean {
  if (!userId) return false;
  if (emergenciasCerca && emergenciasCerca.includes(service.id)) {
    // Suya (proveedor) no: las emergencias ajenas son para conductores.
    if (service.provider_id === userId) return false;
    if (service.archived) return false;
    return service.status === 'STATUS_OPEN';
  }

  // Ya asignado: siempre visible para ese conductor, aunque la hora de inicio ya
  // haya pasado (el viaje en curso tiene que seguir mostrándose).
  if (service.assigned_driver_id === userId) return true;

  // Asignado a otro conductor (o mi propio servicio de proveedor): no es mi alerta.
  if (service.assigned_driver_id) return false;
  if (service.provider_id === userId) return false;

  // Alerta abierta compartida a alguno de mis grupos (0018: puede estar compartida
  // a varios, y el conductor que está en dos grupos tiene que verla UNA vez).
  const grupos = gruposDeServicio(service);
  if (service.status !== 'STATUS_OPEN' || grupos.length === 0) return false;

  // ...y solo mientras no haya pasado la hora de inicio.
  if (estaVencido(service)) return false;

  return grupos.some((groupId) => groupIds.includes(groupId));
}
