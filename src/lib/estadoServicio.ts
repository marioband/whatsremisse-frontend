import { AZUL, OSCURO, ROJO_ACCION, TEXTO_TENUE, VERDE_ACCION } from './colors';
import { esProgramado } from './datetime';
import { estaCompartido } from './gruposDeServicio';
import { EstadoDeMiPostulacion } from './miPostulacion';
import { ServiceAlert } from '../types';

export interface EstadoServicio {
  /**
   * Texto de la franja inferior. **Vacío = no se pinta franja**: no hay nada que
   * comunicar (es el caso normal de una alerta disponible en la lista del
   * conductor).
   */
  etiqueta: string;
  color: string;
  /** El servicio ya se compartió a algún grupo (o sea: salió de "nuevo servicio"). */
  compartido: boolean;
  /** La alerta está en sus últimos minutos: la franja avisa con cuenta atrás. */
  porCerrar?: boolean;
  /** Segunda línea de la franja (p. ej. la cuenta atrás cuando manda "N Postulantes"). */
  aviso?: string;
}

/**
 * Desde qué lado se mira la tarjeta. Las señales del PROVEEDOR describen la alerta
 * que él publicó (¿la compartí?, ¿ya hay postulantes?); las del CONDUCTOR
 * describen su situación frente a la alerta (¿puedo postularme?). El viaje en
 * curso y el pago son comunes a los dos.
 */
export type VistaServicio = 'PROVEEDOR' | 'CONDUCTOR';

/**
 * Lo que el conductor necesita saber de SU postulación para pintar la franja:
 * si sigue esperando, en qué puesto va, o si ya quedó fuera.
 */
export interface MiPostulacionEnLaTarjeta {
  estado: EstadoDeMiPostulacion;
  /** Puesto de la postulación (lo asigna la base); solo se muestra si se conoce. */
  numero?: number | null;
  /**
   * El conductor ya cumplió la orden "toca para iniciar" en este servicio (la
   * tarjeta ya vive en el apartado "En proceso", aunque todavía no haya reportado
   * ningún hito). La marca es local del dispositivo: `lib/inicioDelViaje.ts`.
   */
  iniciado?: boolean;
}

/** El ciclo de pago terminó: el servicio está pagado y cerrado. */
export function estaPagadoYCerrado(service: ServiceAlert): boolean {
  return service.pago_estado === 'CONFIRMADO';
}

/**
 * Estado que comunica la barra inferior de una tarjeta de servicio.
 *
 * Es la única fuente de verdad de las señales del proceso: la tarjeta no decide
 * nada por su cuenta, solo pinta lo que devuelve esta función. El reporte del
 * conductor aceptado (`driver_progress_step`) es el que va moviendo la señal.
 *
 *   Proveedor: no compartido → buscando conductores → (x) postulantes → en camino →
 *              conductor ubicado → servicio en proceso → finalizado → pago
 *   Conductor: disponible → en camino → conductor ubicado → servicio en proceso →
 *              finalizado → pago
 *
 * `Servicio vencido` es del proveedor (su alerta se pasó de hora sin conductor);
 * el conductor ve esas alertas como `No disponible`, nunca la jerga del proveedor.
 */
/**
 * Etiqueta de estado que se pinta en las TARJETAS de "Mis servicios".
 *
 * El usuario quitó de ahí el "Pagado y cerrado" (18-09-2026): el historial de pago que
 * va debajo ("S/ 80.00 · pagó el proveedor · confirmó el conductor…") ya cuenta que se
 * pagó y quién confirmó, así que el rótulo repetía la misma información. En el resto de
 * sitios (el chat, la franja de las tarjetas del inicio) la etiqueta sigue igual.
 */
export function etiquetaParaMisServicios(etiqueta: string): string {
  return etiqueta === 'Pagado y cerrado' ? '' : etiqueta;
}

export function estadoDeServicio(
  service: ServiceAlert,
  postulantesPendientes = 0,
  vista: VistaServicio = 'PROVEEDOR',
  miPostulacion?: MiPostulacionEnLaTarjeta
): EstadoServicio {
  const paso = service.driver_progress_step ?? 0;
  const asignado = !!service.assigned_driver_id;
  const compartido = estaCompartido(service);
  const soyConductor = vista === 'CONDUCTOR';
  // Últimos minutos de vida de la alerta: la franja avisa con cuenta atrás real.
  const restante = minutosParaCerrar(service);
  const porCerrar = restante > 0 && restante <= AVISO_DE_CIERRE_MINUTOS;

  if (service.status === 'STATUS_CANCELLED') {
    return { etiqueta: 'Servicio anulado', color: ROJO_ACCION, compartido };
  }

  if (service.status === 'STATUS_COMPLETED' || paso >= 3) {
    // El viaje terminó: lo que falta es el pago entre conductor y proveedor.
    if (estaPagadoYCerrado(service)) {
      return { etiqueta: 'Pagado y cerrado', color: VERDE_ACCION, compartido };
    }
    return { etiqueta: 'Pendiente de pago', color: OSCURO, compartido };
  }

  // La situación del conductor frente a la alerta también se dice en la franja (ya no
  // con una capa sobre la tarjeta): azul con su puesto, y rojo si quedó fuera —lo
  // rechazó el proveedor o lo cubrió otro conductor, que la base marca igual—.
  if (soyConductor && miPostulacion?.estado === 'RECHAZADA') {
    return {
      etiqueta: 'Servicio rechazado o cubierto por otro conductor',
      color: ROJO_ACCION,
      compartido,
    };
  }

  if (soyConductor && miPostulacion?.estado === 'PENDIENTE') {
    const numero = miPostulacion.numero;
    return {
      etiqueta: numero ? `Postulante ${numero}` : 'Postulación enviada',
      color: AZUL,
      compartido,
    };
  }

  if (asignado) {
    // Aceptado y todavía sin arrancar: verde y a la vista. La franja del conductor
    // lleva la instrucción mientras no haya cumplido el toque; una vez cumplido (su
    // tarjeta ya vive en "En proceso") la instrucción sobra y queda el estado.
    if (soyConductor && paso === 0) {
      return {
        etiqueta: miPostulacion?.iniciado
          ? 'Servicio aceptado'
          : 'Servicio aceptado, toca para iniciar',
        color: VERDE_ACCION,
        compartido,
      };
    }
    if (paso === 1) return { etiqueta: 'Conductor ubicado', color: OSCURO, compartido };
    if (paso === 2) return { etiqueta: 'Servicio en proceso', color: OSCURO, compartido };
    return { etiqueta: 'En camino', color: AZUL, compartido };
  }

  if (!compartido) {
    return {
      etiqueta: soyConductor ? '' : 'Servicio no compartido',
      color: TEXTO_TENUE,
      compartido,
    };
  }

  if (estaVencido(service)) {
    // Defensivo: con la regla de `isVisibleAsDriver` el conductor ya no ve alertas
    // caducadas (desaparecen a la hora de inicio y el proveedor las conserva para
    // editarlas y reenviarlas). Si alguna se colara en un render, igual no le
    // mostramos la señal del proveedor.
    return {
      etiqueta: soyConductor ? '' : 'Servicio vencido',
      color: soyConductor ? TEXTO_TENUE : ROJO_ACCION,
      compartido,
    };
  }

  if (!soyConductor && postulantesPendientes > 0) {
    return {
      etiqueta:
        postulantesPendientes === 1 ? '1 Postulante' : `${postulantesPendientes} Postulantes`,
      // Verde institucional: el usuario pidió que la barra de postulantes de sus
      // servicios publicados sea verde (#2E9E5B), no oscura.
      color: VERDE_ACCION,
      compartido,
      porCerrar,
      // Con postulantes manda el conteo, pero la alerta igual se cierra: la cuenta
      // atrás baja como segunda línea.
      aviso: porCerrar ? avisoDeCierre(service) : undefined,
    };
  }

  return {
    // El conductor no necesita franja en una alerta disponible: la tarjeta ya dice
    // el servicio, la hora, el recorrido y la tarifa.
    etiqueta: soyConductor ? '' : porCerrar ? avisoDeCierre(service) : 'Buscando conductores',
    // La franja azul de "Buscando conductores" pasa a rojo en los últimos 5 minutos.
    color: porCerrar ? ROJO_ACCION : AZUL,
    compartido,
    porCerrar,
  };
}

/**
 * Duración de una alerta antes de cerrarse sola (regla fijada con el usuario):
 *   - **Al momento**: 20 minutos desde que se emite (y se reemite al editarla). En
 *     los últimos 5 el proveedor ve la cuenta atrás.
 *   - **Hora específica**: 10 minutos **después de la hora del servicio**, no desde
 *     su emisión: una alerta para las 10:00 vive hasta las 10:10 aunque se publique
 *     a las 9:00 (y una reserva de dentro de 2 horas, igual: sobrevive hasta su
 *     hora + 10 minutos). El plazo se fija al emitir y no lo mueve una edición
 *     posterior: la hora del servicio manda.
 */
export const MINUTOS_AL_MOMENTO = 20;
export const MINUTOS_CON_HORA = 10;

/** En estos últimos minutos la franja del proveedor avisa con cuenta atrás. */
export const AVISO_DE_CIERRE_MINUTOS = 5;

/**
 * Momento (epoch ms) en que la alerta se cierra.
 *
 * - Al momento (sin hora específica): última escritura + 20 minutos, para que
 *   **editar y reenviar** arranque el plazo de nuevo (misma idea que la 0016, donde
 *   reenviar reinicia la cola de postulantes).
 * - Con hora específica (incluidas las reservas): la hora del servicio + 10 minutos.
 *   Anclarlo a `updated_at` era el error: una alerta para las 10:00 publicada a las
 *   9:00 se daba por cerrada a las 9:10, antes de la hora del servicio.
 */
export function cierreDeLaAlerta(service: ServiceAlert): number {
  if (esProgramado(service)) {
    const horaDelServicio = new Date(service.scheduled_at as string).getTime();
    if (Number.isFinite(horaDelServicio)) {
      return horaDelServicio + MINUTOS_CON_HORA * 60 * 1000;
    }
  }
  const publicada = new Date(service.updated_at || service.created_at).getTime();
  return publicada + MINUTOS_AL_MOMENTO * 60 * 1000;
}

/** Minutos (con decimales) que le quedan a la alerta; negativo si ya cerró. */
export function minutosParaCerrar(service: ServiceAlert, ahora: Date = new Date()): number {
  return (cierreDeLaAlerta(service) - ahora.getTime()) / 60000;
}

/**
 * Aviso de cierre para la franja del proveedor, con la cuenta atrás real:
 * "Buscando conductores, la tarjeta cerrará en 4 minutos: 32 segundos".
 */
export function avisoDeCierre(service: ServiceAlert, ahora: Date = new Date()): string {
  const restante = Math.max(0, cierreDeLaAlerta(service) - ahora.getTime());
  const minutos = Math.floor(restante / 60000);
  const segundos = Math.floor((restante % 60000) / 1000);
  const textoMinutos = minutos === 1 ? '1 minuto' : `${minutos} minutos`;
  const textoSegundos = segundos === 1 ? '1 segundo' : `${segundos} segundos`;
  return `Buscando conductores, la tarjeta cerrará en ${textoMinutos}: ${textoSegundos}`;
}

/**
 * La alerta ya cerró: pasaron sus 20 minutos (al momento) o sus 10 minutos (con hora
 * específica) sin que ningún conductor la tomara.
 */
export function estaVencido(service: ServiceAlert): boolean {
  return cierreDeLaAlerta(service) <= Date.now();
}

/**
 * La alerta caducó SIN que nadie la tomara: se cerró (20 minutos "al momento" / 10
 * minutos después de la hora) y ningún conductor quedó asignado.
 *
 * Regla fijada con el usuario (17-09-2026): una alerta así **sale del inicio de
 * inmediato y ya no se reprograma**; la fila se queda en la base y no la ve nadie
 * (el conductor dejó de verla al cerrarse). Antes se quedaba 24 h "en gracia" para
 * editarla y reenviarla, con la franja roja "Servicio vencido" y el texto "se
 * elimina en 23h 40m": el usuario reportó ese estado como "el servicio vencido sigue
 * activo" y eligió eliminarlo en vez de conservarlo.
 *
 * Las que SÍ se tomaron no se tocan aquí: siguen vivas —"En proceso" para el
 * proveedor— hasta que cierre el pago.
 */
export function caducoNadieLaTomo(service: ServiceAlert): boolean {
  if (service.assigned_driver_id) return false;
  if (service.status === 'STATUS_COMPLETED' || service.status === 'STATUS_CANCELLED') return false;
  if (estaPagadoYCerrado(service)) return false;
  return estaVencido(service);
}
