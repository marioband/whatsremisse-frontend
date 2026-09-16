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
    // Aceptado y todavía sin arrancar: verde y a la vista, con la instrucción.
    if (soyConductor && paso === 0) {
      return { etiqueta: 'Servicio aceptado, toca para iniciar', color: VERDE_ACCION, compartido };
    }
    if (paso === 1) return { etiqueta: 'Conductor ubicado', color: OSCURO, compartido };
    if (paso === 2) return { etiqueta: 'Servicio en Proceso', color: OSCURO, compartido };
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
 * Minutos que una alerta se mantiene viva y en los grupos antes de cerrarse sola:
 * 20 si se publicó **al momento** y 10 si el proveedor eligió una **hora específica**
 * (regla del usuario). El reloj arranca en la última publicación/edición.
 */
export const MINUTOS_AL_MOMENTO = 20;
export const MINUTOS_CON_HORA = 10;

/** En estos últimos minutos la franja del proveedor avisa con cuenta atrás. */
export const AVISO_DE_CIERRE_MINUTOS = 5;

/**
 * Momento (epoch ms) en que la alerta se cierra.
 *
 * Se ancla en `updated_at` —que la base actualiza en cada escritura— para que
 * **editar y reenviar** el servicio arranque el plazo de nuevo (misma idea que la
 * 0016, donde reenviar reinicia la cola de postulantes).
 */
export function cierreDeLaAlerta(service: ServiceAlert): number {
  const publicada = new Date(service.updated_at || service.created_at).getTime();
  const minutos = esProgramado(service) ? MINUTOS_CON_HORA : MINUTOS_AL_MOMENTO;
  return publicada + minutos * 60 * 1000;
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
