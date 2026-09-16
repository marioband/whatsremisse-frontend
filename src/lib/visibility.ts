import { ServiceAlert } from '../types';
import { estaVencido } from './estadoServicio';

/**
 * Reglas de visibilidad de los servicios, en un solo lugar para que las dos
 * pestanas del inicio y el canal de tiempo real no se contradigan.
 *
 * - Proveedor: solo ve los servicios que publico el mismo.
 * - Conductor: ve las alertas abiertas que se compartieron a alguno de sus
 *   grupos, mas las que ya tiene asignadas. Nunca las suyas de proveedor.
 *
 * - Alertas caducadas (paso la hora de inicio y nadie las tomo): desaparecen del
 *   lado del conductor en cuanto se cumple la hora (a las 8:01 ya no ve la de las
 *   8:00) y siguen en la lista del proveedor, que es quien puede editarlas y
 *   volver a enviarlas.
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
  groupIds: readonly string[]
): boolean {
  if (!userId) return false;

  // Ya asignado: siempre visible para ese conductor, aunque la hora de inicio ya
  // haya pasado (el viaje en curso tiene que seguir mostrándose).
  if (service.assigned_driver_id === userId) return true;

  // Asignado a otro conductor (o mi propio servicio de proveedor): no es mi alerta.
  if (service.assigned_driver_id) return false;
  if (service.provider_id === userId) return false;

  // Alerta abierta compartida a alguno de mis grupos.
  if (service.status !== 'STATUS_OPEN' || !service.group_id) return false;

  // ...y solo mientras no haya pasado la hora de inicio.
  if (estaVencido(service)) return false;

  return groupIds.includes(service.group_id);
}
