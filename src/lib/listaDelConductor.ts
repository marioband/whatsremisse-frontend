import { Application, ServiceAlert } from '../types';
import { esProgramado } from './datetime';
import { estaPagadoYCerrado } from './estadoServicio';
import { EstadoDeMiPostulacion } from './miPostulacion';
import { isVisibleAsDriver } from './visibility';

/**
 * Qué tarjetas ve el CONDUCTOR en su inicio y en qué apartado.
 *
 * Vive aquí (y no dentro de la pantalla) porque son reglas del negocio y hay que
 * poder probarlas: el caso del rechazo se daba por hecho y en realidad la tarjeta
 * no se iba nunca —`isOpenAndAvailable` seguía siendo cierto para una alerta
 * abierta sin asignar, aunque mi postulación estuviera rechazada—, así que el
 * conductor veía el aviso rojo para siempre. Con la lógica aquí, la prueba
 * comprueba lo mismo que ejecuta la pantalla.
 */

export type FiltroDelInicio = 'Todos' | 'En proceso' | 'Reservas';

/** La fila de `applications` que la base guarda para este conductor y servicio. */
export function filaDeMiPostulacion(
  applications: Application[],
  serviceId: string,
  userId: string
): Application | undefined {
  return applications.find((a) => a.serviceId === serviceId && a.driverId === userId);
}

/** Tengo una postulación VIVA (en cola) en ese servicio. */
export function tengoPostulacionViva(
  applications: Application[],
  serviceId: string,
  userId: string
): boolean {
  const fila = filaDeMiPostulacion(applications, serviceId, userId);
  return fila?.status === 'PENDING';
}

/**
 * El servicio ya es MÍO: el proveedor me aceptó (aunque el viaje todavía no
 * arranque) y sigue vivo. Es lo que mueve la tarjeta al apartado "En proceso".
 */
export function esAceptadoMio(service: ServiceAlert, userId: string): boolean {
  return (
    !!userId &&
    service.assigned_driver_id === userId &&
    service.status !== 'STATUS_COMPLETED' &&
    service.status !== 'STATUS_CANCELLED' &&
    !estaPagadoYCerrado(service)
  );
}

/**
 * Hito del viaje que tiene el servicio (0 = aceptado y todavía sin iniciar).
 * 1 Ubicado · 2 En proceso · 3 Finalizado.
 */
export function pasoDelViaje(service: ServiceAlert): number {
  return service.driver_progress_step ?? 0;
}

/**
 * Aceptado pero **todavía sin iniciar**: el conductor no ha cumplido aún la orden
 * "toca para iniciar" (regla del usuario). Su tarjeta se queda en "Todos" con la
 * franja verde y solo después del toque pasa a "En proceso".
 *
 * El toque **no reporta ningún hito** (`yaIniciadoElViaje` es la marca local del
 * dispositivo, ver `lib/inicioDelViaje.ts`): el conductor todavía no se ha dirigido al
 * punto de origen, así que "Ubicado" lo activa él cuando desliza la barra en el chat.
 */
export function esperaElToqueDeInicio(
  service: ServiceAlert,
  userId: string,
  yaIniciadoElViaje = false
): boolean {
  return esAceptadoMio(service, userId) && pasoDelViaje(service) < 1 && !yaIniciadoElViaje;
}

/**
 * Apartado "En proceso": el viaje **ya se inició** (el conductor cumplió el toque de
 * inicio o ya reportó algún hito), sin importar si el servicio tiene hora específica o
 * es "al momento".
 */
export function esEnProcesoDelConductor(
  service: ServiceAlert,
  userId: string,
  yaIniciadoElViaje = false
): boolean {
  return (
    (esAceptadoMio(service, userId) && (pasoDelViaje(service) >= 1 || yaIniciadoElViaje)) ||
    service.status === 'STATUS_IN_PROGRESS'
  );
}

/** Apartado "Reservas": ya aceptado y con hora específica (no "al momento"). */
export function esReservaDelConductor(service: ServiceAlert, userId: string): boolean {
  return esAceptadoMio(service, userId) && esProgramado(service);
}

/** Alerta abierta y sin postulación mía viva: la tarjeta que puedo tomar. */
export function estaDisponibleParaPostular(
  service: ServiceAlert,
  applications: Application[],
  userId: string
): boolean {
  return (
    service.status === 'STATUS_OPEN' &&
    !service.assigned_driver_id &&
    !tengoPostulacionViva(applications, service.id, userId)
  );
}

/** El vehículo del conductor sirve para esta alerta (requisito vacío = sirve). */
export function coincideConElVehiculo(service: ServiceAlert, tipoDeVehiculo: string): boolean {
  const requerido = service.vehicle_requirements?.vehicle_type;
  if (!requerido || requerido === 'Todos') return true;
  return requerido === tipoDeVehiculo;
}

const enFecha = (valor?: string | null): number | null => {
  if (!valor) return null;
  const t = new Date(valor).getTime();
  return Number.isFinite(t) ? t : null;
};

/**
 * ¿El rechazo de MI postulación sigue en pie?
 *
 * Regla del usuario: rechazado el conductor, ya no puede ver el servicio, **a
 * menos que el proveedor edite la alerta** (eso reabre la cola: la migración 0016
 * descarta las postulaciones viejas y él puede volver a postularse).
 *
 * El discriminador no puede ser `applications.updated_at` —esa columna no
 * existe—, así que se comparan dos marcas que la base sí escribe:
 *   - `applications.created_at`: cuándo me postulé (la app lo refresca en cada
 *     nueva postulación, así que es mi última postulación).
 *   - `service_alerts.updated_at`: la última escritura del proveedor sobre la
 *     alerta (editar, reenviar o aceptar a otro la tocan; rechazarme a mí NO la
 *     toca, porque el rechazo solo escribe `applications`).
 * Si la alerta se escribió DESPUÉS de mi postulación, es que el proveedor la
 * editó y el rechazo caducó. Sin marcas (datos viejos o sin Supabase) se respeta
 * el rechazo: quitarla de la vista es lo que pidió el usuario.
 */
export function rechazoVigente(
  service: ServiceAlert,
  filaDeMiPostulacion: Application | undefined
): boolean {
  if (!filaDeMiPostulacion || filaDeMiPostulacion.status !== 'REJECTED') return false;

  const alerta = enFecha(service.updated_at);
  const postulacion = enFecha(filaDeMiPostulacion.createdAt);
  if (alerta === null || postulacion === null) return true;

  return alerta <= postulacion;
}

/**
 * El estado de mi postulación que la TARJETA debe mostrar.
 *
 * Es el mismo que `estadoDeMiPostulacion`, salvo que un rechazo caducado (la alerta
 * se editó después de mi postulación, o sea: el proveedor reabrió el servicio) se
 * reporta como NINGUNA: la franja roja de "Servicio rechazado o cubierto por otro
 * conductor" ya no tiene sentido y el conductor puede volver a postularse.
 */
export function estadoEfectivoDeMiPostulacion(
  service: ServiceAlert,
  filaDeMiPostulacion: Application | undefined
): EstadoDeMiPostulacion {
  if (!filaDeMiPostulacion) return 'NINGUNA';
  if (filaDeMiPostulacion.status === 'PENDING') return 'PENDIENTE';
  if (filaDeMiPostulacion.status === 'APPROVED') return 'ACEPTADA';
  return rechazoVigente(service, filaDeMiPostulacion) ? 'RECHAZADA' : 'NINGUNA';
}

export interface OpcionesDelInicioDelConductor {
  userId: string;
  groupIds: readonly string[];
  tipoDeVehiculo: string;
  mostrarArchivados?: boolean;
  /** Ventana de 3 segundos del rechazo recién llegado (la gestiona la pantalla). */
  rechazoReciente?: (serviceId: string) => boolean;
  /** El conductor ya cumplió el toque de inicio de ese servicio (marca local). */
  inicioCumplido?: (serviceId: string) => boolean;
}

/** Siempre false: el valor por defecto de "no acabo de ser rechazado". */
const nuncaReciente = () => false;

/** Siempre false: el valor por defecto de "todavía no cumplió el toque de inicio". */
const nuncaIniciado = () => false;

/**
 * Lista base del inicio del conductor: las tarjetas que PUEDE ver, ya sin
 * archivadas, anuladas, cerradas, de otros vehículos, ni las de un rechazo que
 * sigue en pie (salvo durante los 3 segundos del aviso).
 */
export function listaBaseDelConductor(
  services: ServiceAlert[],
  applications: Application[],
  opciones: OpcionesDelInicioDelConductor
): ServiceAlert[] {
  const { userId, groupIds, tipoDeVehiculo, mostrarArchivados, rechazoReciente } = opciones;
  const reciente = rechazoReciente ?? nuncaReciente;
  const vistos = new Set<string>();

  return services.filter((s) => {
    // Deduplicación estricta por service_id (una alerta compartida a varios grupos
    // llega una sola vez).
    if (vistos.has(s.id)) return false;
    vistos.add(s.id);

    if (mostrarArchivados ? !s.archived : s.archived) return false;
    if (s.status === 'STATUS_CANCELLED') return false;
    // Pagado y cerrado: ya vive en "Mis servicios" con su historial de pago.
    if (estaPagadoYCerrado(s)) return false;

    const recienRechazado = reciente(s.id);

    // Visible como alerta de mis grupos (o asignada a mí), o el aviso del rechazo…
    if (!isVisibleAsDriver(s, userId, groupIds) && !recienRechazado) return false;

    // …pero si el rechazo sigue en pie, la tarjeta se va al cumplirse los 3
    // segundos: el conductor ya no ve el servicio.
    const fila = filaDeMiPostulacion(applications, s.id, userId);
    if (rechazoVigente(s, fila) && !recienRechazado) return false;

    if (!coincideConElVehiculo(s, tipoDeVehiculo)) return false;
    return true;
  });
}

/**
 * Las tarjetas de un apartado concreto del inicio del conductor.
 *   - "Todos": lo que puedo tomar, lo que postulé, el rechazo recién llegado (3 s) y
 *     lo aceptado que todavía espera el toque de inicio.
 *   - "En proceso": el viaje ya iniciado (o en curso).
 *   - "Reservas": lo mío con hora específica.
 */
export function serviciosDelInicio(
  base: ServiceAlert[],
  applications: Application[],
  filtro: FiltroDelInicio,
  opciones: OpcionesDelInicioDelConductor
): ServiceAlert[] {
  const reciente = opciones.rechazoReciente ?? nuncaReciente;
  const inicioCumplido = opciones.inicioCumplido ?? nuncaIniciado;

  if (filtro === 'En proceso') {
    return base.filter(
      (s) =>
        esEnProcesoDelConductor(s, opciones.userId, inicioCumplido(s.id)) &&
        s.status !== 'STATUS_COMPLETED'
    );
  }
  if (filtro === 'Reservas') {
    return base.filter((s) => esReservaDelConductor(s, opciones.userId));
  }
  return base.filter(
    (s) =>
      estaDisponibleParaPostular(s, applications, opciones.userId) ||
      tengoPostulacionViva(applications, s.id, opciones.userId) ||
      esperaElToqueDeInicio(s, opciones.userId, inicioCumplido(s.id)) ||
      reciente(s.id)
  );
}

/** Contador de la píldora "En proceso" (la MISMA condición que la lista). */
export function contarEnProceso(
  base: ServiceAlert[],
  opciones: OpcionesDelInicioDelConductor
): number {
  const inicioCumplido = opciones.inicioCumplido ?? nuncaIniciado;
  return base.filter(
    (s) =>
      esEnProcesoDelConductor(s, opciones.userId, inicioCumplido(s.id)) &&
      s.status !== 'STATUS_COMPLETED'
  ).length;
}

/** Contador de la píldora "Reservas" (la MISMA condición que la lista). */
export function contarReservas(
  base: ServiceAlert[],
  opciones: OpcionesDelInicioDelConductor
): number {
  return base.filter((s) => esReservaDelConductor(s, opciones.userId)).length;
}
