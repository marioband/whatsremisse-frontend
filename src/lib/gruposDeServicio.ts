import { ServiceAlert } from '../types';

/**
 * Grupos con los que está compartida una alerta (migración 0018).
 *
 * `service_alerts.group_id` es el grupo PRINCIPAL (el primero que eligió el
 * proveedor) y se conserva por compatibilidad; la lista completa vive en
 * `service_alert_groups` y viaja en `shared_group_ids` cuando la lectura la trae.
 *
 * Antes la tarjeta era de un solo grupo y se creaba una fila por grupo: el conductor
 * que estaba en dos grupos veía la misma alerta dos veces (dos tarjetas, dos avisos,
 * dos juegos de postulantes). Regla: **una alerta se comparte a N grupos, no se
 * duplica por grupo**.
 */
export function gruposDeServicio(service: ServiceAlert | undefined): string[] {
  if (!service) return [];
  if (service.shared_group_ids && service.shared_group_ids.length > 0) {
    return service.shared_group_ids;
  }
  // Sin la lista completa (p. ej. una fila que llegó por tiempo real) vale el grupo
  // principal: es lo que hacía la app antes de la 0018.
  return service.group_id ? [service.group_id] : [];
}

/** ¿La alerta salió de "nuevo servicio"? (equivale a la franja "Servicio no compartido"). */
export function estaCompartido(service: ServiceAlert | undefined): boolean {
  return gruposDeServicio(service).length > 0;
}

/** Añade a la fila los grupos leídos de `service_alert_groups`. */
export function conGrupos(service: ServiceAlert, groupIds: string[]): ServiceAlert {
  return { ...service, shared_group_ids: groupIds };
}
