import { ServiceAlert } from '../types';

/**
 * Reglas de visibilidad de los servicios, en un solo lugar para que las dos
 * pestanas del inicio y el canal de tiempo real no se contradigan.
 *
 * - Proveedor: solo ve los servicios que publico el mismo.
 * - Conductor: ve las alertas abiertas que se compartieron a alguno de sus
 *   grupos, mas las que ya tiene asignadas. Nunca las suyas de proveedor.
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

  // Ya asignado: siempre visible para ese conductor.
  if (service.assigned_driver_id === userId) return true;

  // Asignado a otro conductor (o mi propio servicio de proveedor): no es mi alerta.
  if (service.assigned_driver_id) return false;
  if (service.provider_id === userId) return false;

  // Alerta abierta compartida a alguno de mis grupos.
  if (service.status !== 'STATUS_OPEN' || !service.group_id) return false;
  return groupIds.includes(service.group_id);
}
