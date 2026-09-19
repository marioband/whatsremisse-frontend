import { Application, ServiceAlert } from '../types';
import { estaEnProcesoDelConductor } from './apartadosDelInicio';
import { estaPagadoYCerrado } from './estadoServicio';
import { huellaDeLaAlerta } from './marcaDePostulacion';
import { EstadoDeMiPostulacion } from './miPostulacion';
import { coincideConLaUnidad } from './unidades';
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

/**
 * Apartados del inicio del CONDUCTOR (17-09-2026): "Todos" pasó a llamarse
 * "Disponibles" y "Reservas" desapareció como apartado (las reservas viven dentro de
 * "En proceso", ordenadas por la regla de `lib/apartadosDelInicio.ts`).
 */
export type FiltroDelInicio = 'Disponibles' | 'En proceso';

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

// Los apartados "En proceso" de los dos modos (y su orden) viven en
// `lib/apartadosDelInicio.ts`: aquí solo queda el reparto de la lista del conductor.

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

/**
 * El vehículo del conductor sirve para esta alerta.
 *
 * Desde el 19-09-2026 el requisito y el conductor pueden traer VARIAS unidades: basta con que
 * coincida una. La regla vive en `lib/unidades.ts` (aquí solo se deja el nombre viejo, que es
 * el que consultan el inicio del conductor y los bancos de prueba).
 */
export function coincideConElVehiculo(
  service: ServiceAlert,
  misUnidades: string | readonly string[]
): boolean {
  return coincideConLaUnidad(service, misUnidades);
}

/**
 * ¿El rechazo de MI postulación sigue en pie?
 *
 * Regla del usuario: rechazado el conductor, ya no puede ver el servicio, **a
 * menos que el proveedor edite la alerta** (esa edición descarta la cola vieja por
 * la migración 0016 y él puede volver a postularse).
 *
 * El discriminador NO puede ser una comparación de tiempos: rechazar también
 * escribe en `service_alerts` (la app reabre la alerta con `status` y
 * `assigned_driver_id`), así que `updated_at` queda siempre después de mi
 * postulación y todo rechazo parecería una edición (ese era el fallo: la tarjeta se
 * veía como disponible, sin el mensaje). Se compara la HUELLA de los campos
 * editables (`lib/marcaDePostulacion.ts`): si no cambió, nadie editó la alerta.
 * Sin marca (postulación vieja, otro dispositivo) manda el rechazo, que es la regla
 * principal que pidió el usuario.
 */
export function rechazoVigente(
  service: ServiceAlert,
  filaDeMiPostulacion: Application | undefined,
  huellaAlPostular?: string
): boolean {
  if (!filaDeMiPostulacion || filaDeMiPostulacion.status !== 'REJECTED') return false;
  if (!huellaAlPostular) return true;
  return huellaAlPostular === huellaDeLaAlerta(service);
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
  filaDeMiPostulacion: Application | undefined,
  huellaAlPostular?: string,
  userId?: string
): EstadoDeMiPostulacion {
  // La BASE manda: si el servicio está asignado a mí, estoy ACEPTADO aunque la fila de
  // mi postulación diga otra cosa. Caso real (17-09-2026, conductor 999888777): el
  // proveedor lo aceptó y su propio teléfono volvió a postularse después —todavía no
  // sabía que lo habían aceptado—, así que la fila quedó en PENDING; la tarjeta decía
  // "postulando", el toque no abría el chat y el viaje ya estaba asignado a él.
  const mio = userId ?? filaDeMiPostulacion?.driverId;
  if (mio && service.assigned_driver_id === mio) return 'ACEPTADA';

  if (!filaDeMiPostulacion) return 'NINGUNA';
  if (filaDeMiPostulacion.status === 'PENDING') return 'PENDIENTE';
  if (filaDeMiPostulacion.status === 'APPROVED') return 'ACEPTADA';
  return rechazoVigente(service, filaDeMiPostulacion, huellaAlPostular) ? 'RECHAZADA' : 'NINGUNA';
}

/**
 * Qué debe hacer el toque en una tarjeta del inicio del conductor.
 *
 * Vive aquí, y no dentro de la pantalla, porque es el ORDEN de las comprobaciones la
 * regla (y el punto donde se colaba el fallo del 17-09: la comprobación de "tengo una
 * postulación" iba ANTES que la de "el servicio ya es mío", así que un conductor
 * aceptado con la fila vieja en PENDING no podía abrir el chat del servicio que ya
 * estaba cubriendo).
 *
 *  1. El servicio ya es mío (asignado a mí, o en proceso, o terminado) → abre el chat.
 *     Si además espera el toque de inicio, ese toque se cumple aquí.
 *  2. Estoy postulado (PENDING) → el chat solo se abre si el proveedor me escribió
 *     (regla del usuario: no hay nada que hablar hasta que haya mensaje).
 *  3. Cualquier otro caso → postularme.
 */
export type PlanDelToqueDelConductor =
  | { accion: 'ABRIR_CHAT'; cumpleElToqueDeInicio: boolean }
  | { accion: 'POSTULARSE' }
  | { accion: 'NADA'; motivo: 'SIN_MENSAJE_DEL_PROVEEDOR' };

/**
 * ¿La tarjeta del conductor está BLOQUEADA (no deja tocar)?
 *
 * Solo mientras mi postulación sigue PENDIENTE y el proveedor todavía no escribió (regla
 * del usuario: no hay nada que hablar). Si ya me aceptó, la tarjeta tiene que poder
 * abrirse aunque el aviso de mensaje esté en cero: era una de las razones por las que el
 * conductor aceptado no podía entrar al chat de su propio viaje.
 */
export function tarjetaBloqueadaDelConductor(datos: {
  isApplied: boolean;
  notificationCount: number;
  miEstado?: EstadoDeMiPostulacion;
}): boolean {
  return datos.isApplied && datos.notificationCount === 0 && datos.miEstado === 'PENDIENTE';
}

export function planDelToqueDelConductor(datos: {
  service: ServiceAlert;
  userId: string;
  miEstado: EstadoDeMiPostulacion;
  /** El proveedor ya escribió en el chat de este servicio (aviso sin leer). */
  hayMensajeDelProveedor: boolean;
  /** El conductor ya cumplió en este dispositivo el "toca para iniciar". */
  yaIniciadoElViaje: boolean;
}): PlanDelToqueDelConductor {
  const { service, userId, miEstado, hayMensajeDelProveedor, yaIniciadoElViaje } = datos;

  const esMioOEstaEnCurso =
    esAceptadoMio(service, userId) ||
    service.status === 'STATUS_IN_PROGRESS' ||
    service.status === 'STATUS_COMPLETED';

  if (esMioOEstaEnCurso || miEstado === 'ACEPTADA') {
    return {
      accion: 'ABRIR_CHAT',
      cumpleElToqueDeInicio: esperaElToqueDeInicio(service, userId, yaIniciadoElViaje),
    };
  }

  if (miEstado === 'PENDIENTE') {
    if (hayMensajeDelProveedor) return { accion: 'ABRIR_CHAT', cumpleElToqueDeInicio: false };
    return { accion: 'NADA', motivo: 'SIN_MENSAJE_DEL_PROVEEDOR' };
  }

  return { accion: 'POSTULARSE' };
}

export interface OpcionesDelInicioDelConductor {
  userId: string;
  groupIds: readonly string[];
  /**
   * Las unidades del conductor (19-09-2026: puede tener VARIAS). Antes era `tipoDeVehiculo`,
   * un solo texto; la alerta se le muestra si comparten alguna unidad.
   */
  tiposDeVehiculo: readonly string[];
  mostrarArchivados?: boolean;
  /** Ventana de 3 segundos del rechazo recién llegado (la gestiona la pantalla). */
  rechazoReciente?: (serviceId: string) => boolean;
  /** El conductor ya cumplió el toque de inicio de ese servicio (marca local). */
  inicioCumplido?: (serviceId: string) => boolean;
  /** Huella de la alerta cuando me postulé (marca local): ver `rechazoVigente`. */
  huellaAlPostular?: (serviceId: string) => string | undefined;
}

/** Siempre false: el valor por defecto de "no acabo de ser rechazado". */
const nuncaReciente = () => false;

/** Siempre false: el valor por defecto de "todavía no cumplió el toque de inicio". */
const nuncaIniciado = () => false;

/** Sin huella guardada: el rechazo se respeta (regla principal del usuario). */
const nuncaPostulado = () => undefined;

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
  const { userId, groupIds, tiposDeVehiculo, mostrarArchivados, rechazoReciente } = opciones;
  const reciente = rechazoReciente ?? nuncaReciente;
  const huellaAlPostular = opciones.huellaAlPostular ?? nuncaPostulado;
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
    if (rechazoVigente(s, fila, huellaAlPostular(s.id)) && !recienRechazado) return false;

    if (!coincideConElVehiculo(s, tiposDeVehiculo)) return false;
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
    // Todo lo mío que YA ARRANCÓ (el toque "toca para iniciar" o el primer hito),
    // incluidos el viaje en proceso, las reservas en curso y lo terminado con el pago
    // abierto: la tarjeta sale de aquí cuando el proceso de pago cierra (Mis servicios).
    return base.filter((s) => estaEnProcesoDelConductor(s, opciones.userId, inicioCumplido(s.id)));
  }

  // "Disponibles": lo que puedo tomar, lo que postulé, el rechazo recién llegado y la
  // tarjeta ACEPTADA QUE TODAVÍA NO ARRANCÓ (esa se queda aquí hasta que el conductor
  // toque "Servicio aceptado, toca para iniciar"). Los dos apartados son complementarios:
  // lo que ya está en "En proceso" no se repite aquí (por ejemplo si la marca del toque
  // vino de la base y este teléfono no la tiene).
  return base.filter(
    (s) =>
      !estaEnProcesoDelConductor(s, opciones.userId, inicioCumplido(s.id)) &&
      (estaDisponibleParaPostular(s, applications, opciones.userId) ||
        tengoPostulacionViva(applications, s.id, opciones.userId) ||
        esperaElToqueDeInicio(s, opciones.userId, inicioCumplido(s.id)) ||
        reciente(s.id))
  );
}

/** Contador de la píldora "En proceso" (la MISMA condición que la lista). */
export function contarEnProceso(
  base: ServiceAlert[],
  opciones: OpcionesDelInicioDelConductor
): number {
  const inicioCumplido = opciones.inicioCumplido ?? nuncaIniciado;
  return base.filter((s) => estaEnProcesoDelConductor(s, opciones.userId, inicioCumplido(s.id)))
    .length;
}
