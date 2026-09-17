/**
 * Reglas de los apartados del inicio, COMPARTIDAS por el modo Conductor y el modo
 * Proveedor.
 *
 * Reestructuración pedida por el usuario (17-09-2026):
 *
 *   - El apartado "Todos" pasa a llamarse **"Disponibles"** (conductor) y
 *     **"Publicados"** (proveedor).
 *   - El apartado **"En proceso"** abarca TODO lo que ya arrancó: el viaje en proceso,
 *     las reservas en curso y los servicios terminados cuyo pago sigue abierto. La
 *     tarjeta sale de ahí (y pasa a "Mis servicios") **solo cuando el proceso de pago
 *     ha finalizado** (`pago_estado = 'CONFIRMADO'`).
 *   - Los apartados "Reservas" y "Finalizados" desaparecen de la pantalla.
 *   - El orden dentro de "En proceso" es: **activos → reservas próximas → pagos
 *     pendientes → reservas**. Una reserva entra en "reservas próximas" (por encima de
 *     los pagos pendientes) **30 minutos antes** de la hora del servicio y se queda ahí
 *     hasta que el viaje termine o la reserva deje de estar vigente.
 *
 * Cuándo entra una tarjeta en "En proceso" (lo fijó el usuario al aclarar el caso):
 * cuando el conductor hace la acción **"Servicio aceptado, toca para iniciar"**. Antes
 * de ese toque, la tarjeta se queda en "Disponibles" (conductor) y "Publicados"
 * (proveedor), aunque el servicio ya esté asignado.
 *
 * El toque NO es un hito (`driver_progress_step` sigue igual): se guarda en la columna
 * `service_alerts.driver_started_at` (migración 0022) para que el proveedor —que no ve
 * las marcas locales del teléfono del conductor— sepa lo mismo, y en el dispositivo
 * como respaldo sin conexión (`lib/inicioDelViaje.ts`).
 */

import { esProgramado } from './datetime';
import { caducoNadieLaTomo, estaPagadoYCerrado } from './estadoServicio';
import { ServiceAlert } from '../types';

/** Cuánto antes de su hora una reserva adelanta a los pagos pendientes. */
export const MINUTOS_DE_ANTICIPO_DE_LA_RESERVA = 30;

const MS_MINUTO = 60 * 1000;

/** Hito del viaje que tiene el servicio (0 = aceptado y todavía sin iniciar). */
function pasoDelViaje(service: ServiceAlert): number {
  return service.driver_progress_step ?? 0;
}

/**
 * ¿El viaje ya arrancó? Es el toque "toca para iniciar" (marca del dispositivo O
 * `driver_started_at` de la base) o, si ya se reportó un hito, el primer hito.
 */
export function arrancoElViaje(service: ServiceAlert, toqueEnEsteDispositivo = false): boolean {
  return !!service.driver_started_at || toqueEnEsteDispositivo || pasoDelViaje(service) >= 1;
}

/** El viaje terminó (el conductor lo cerró) y el proceso de pago sigue abierto. */
export function tienePagoPendiente(service: ServiceAlert): boolean {
  if (service.status === 'STATUS_CANCELLED') return false;
  const terminado = service.status === 'STATUS_COMPLETED' || pasoDelViaje(service) >= 3;
  return terminado && !estaPagadoYCerrado(service);
}

/** Reserva: tiene hora específica y todavía no ha terminado (ni se anuló). */
export function esReservaViva(service: ServiceAlert): boolean {
  return (
    esProgramado(service) &&
    service.status !== 'STATUS_COMPLETED' &&
    service.status !== 'STATUS_CANCELLED'
  );
}

/** Servicio vivo (ni anulado ni con el pago ya cerrado): es el que sigue en pantalla. */
function sigueVivo(service: ServiceAlert): boolean {
  return service.status !== 'STATUS_CANCELLED' && !estaPagadoYCerrado(service);
}

/**
 * Apartado "En proceso" del CONDUCTOR: lo suyo ya arrancado, hasta que cierre el pago
 * (incluye el viaje en proceso, las reservas en curso y lo terminado sin cerrar).
 */
export function estaEnProcesoDelConductor(
  service: ServiceAlert,
  userId: string,
  toqueEnEsteDispositivo = false
): boolean {
  return (
    !!userId &&
    service.assigned_driver_id === userId &&
    sigueVivo(service) &&
    arrancoElViaje(service, toqueEnEsteDispositivo)
  );
}

/**
 * Apartado "En proceso" del PROVEEDOR: los servicios que ya tienen a un conductor
 * trabajando (arrancó) hasta que cierre el pago. Mientras el conductor no haga el toque,
 * la tarjeta se queda en "Publicados", aunque el servicio ya esté asignado.
 */
export function estaEnProcesoDelProveedor(service: ServiceAlert): boolean {
  return !!service.assigned_driver_id && sigueVivo(service) && arrancoElViaje(service);
}

/** Grupo de orden dentro de "En proceso". */
export type GrupoDeEnProceso = 'ACTIVO' | 'RESERVA_PROXIMA' | 'PAGO_PENDIENTE' | 'RESERVA';

/** Orden de los grupos, de arriba abajo. */
export const ORDEN_DE_LOS_GRUPOS: readonly GrupoDeEnProceso[] = [
  'ACTIVO',
  'RESERVA_PROXIMA',
  'PAGO_PENDIENTE',
  'RESERVA',
];

/**
 * En qué grupo cae una tarjeta de "En proceso".
 *
 * Una reserva pasa a "RESERVA_PROXIMA" en cuanto faltan 30 minutos o menos para su hora
 * (y se queda ahí cuando la hora ya pasó, hasta que el viaje termine o la reserva deje de
 * estar vigente). Los servicios terminados con el pago abierto son "PAGO_PENDIENTE".
 */
export function grupoEnProceso(
  service: ServiceAlert,
  ahora: number = Date.now()
): GrupoDeEnProceso {
  if (tienePagoPendiente(service)) return 'PAGO_PENDIENTE';

  if (esReservaViva(service)) {
    const faltan = new Date(service.scheduled_at as string).getTime() - ahora;
    return faltan <= MINUTOS_DE_ANTICIPO_DE_LA_RESERVA * MS_MINUTO ? 'RESERVA_PROXIMA' : 'RESERVA';
  }

  return 'ACTIVO';
}

/**
 * Orden de las tarjetas de "En proceso" (el mismo para el conductor y el proveedor).
 *
 * Entre grupos manda el orden de arriba; dentro de las reservas se ordena por la HORA del
 * servicio (la próxima primero, que es lo útil cuando hay varias) y en los demás grupos
 * por lo más reciente, como en el resto de la app.
 */
export function ordenarEnProceso(
  services: ServiceAlert[],
  ahora: number = Date.now()
): ServiceAlert[] {
  const peso = new Map(ORDEN_DE_LOS_GRUPOS.map((grupo, indice) => [grupo, indice]));
  return [...services].sort((a, b) => {
    const grupoA = grupoEnProceso(a, ahora);
    const grupoB = grupoEnProceso(b, ahora);
    if (grupoA !== grupoB) return (peso.get(grupoA) ?? 0) - (peso.get(grupoB) ?? 0);

    if (grupoA === 'RESERVA' || grupoA === 'RESERVA_PROXIMA') {
      return (
        new Date(a.scheduled_at as string).getTime() - new Date(b.scheduled_at as string).getTime()
      );
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

/**
 * Servicios que el PROVEEDOR ve en su inicio (o en "Archivados").
 *
 * La lista y el contador salen de la MISMA función (regla del proyecto): una tarjeta
 * que sale de aquí tampoco cuenta en la píldora "En proceso".
 *
 * Fuera de la lista: archivados (o solo archivados, en esa vista), lo que ya cerró el
 * pago (vive en "Mis servicios") y —regla del usuario, 17-09-2026— **lo que caducó sin
 * que nadie lo tomara**, que antes se quedaba 24 h "en gracia" para reprogramarlo.
 */
export function listaDelProveedor(
  services: ServiceAlert[],
  opciones: { mostrarArchivados?: boolean } = {}
): ServiceAlert[] {
  const mostrarArchivados = opciones.mostrarArchivados ?? false;
  const vistos = new Set<string>();

  return services.filter((s) => {
    if (vistos.has(s.id)) return false;
    vistos.add(s.id);
    if (mostrarArchivados ? !s.archived : s.archived) return false;
    if (estaPagadoYCerrado(s)) return false;
    if (caducoNadieLaTomo(s)) return false;
    return true;
  });
}
