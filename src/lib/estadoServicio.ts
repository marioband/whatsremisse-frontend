import { AZUL, OSCURO, ROJO_ACCION, TEXTO_TENUE, VERDE_ACCION } from './colors';
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
}

/**
 * Desde qué lado se mira la tarjeta. Las señales del PROVEEDOR describen la alerta
 * que él publicó (¿la compartí?, ¿ya hay postulantes?); las del CONDUCTOR
 * describen su situación frente a la alerta (¿puedo postularme?). El viaje en
 * curso y el pago son comunes a los dos.
 */
export type VistaServicio = 'PROVEEDOR' | 'CONDUCTOR';

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
  vista: VistaServicio = 'PROVEEDOR'
): EstadoServicio {
  const paso = service.driver_progress_step ?? 0;
  const asignado = !!service.assigned_driver_id;
  const compartido = !!service.group_id;
  const soyConductor = vista === 'CONDUCTOR';

  if (service.status === 'STATUS_CANCELLED') {
    return { etiqueta: 'Servicio anulado', color: ROJO_ACCION, compartido };
  }

  if (service.status === 'STATUS_COMPLETED' || paso >= 3) {
    // El viaje terminó: lo que falta es el pago entre conductor y proveedor.
    if (service.pago_estado === 'CONFIRMADO') {
      return { etiqueta: 'Pagado y cerrado', color: VERDE_ACCION, compartido };
    }
    return { etiqueta: 'Pendiente de pago', color: OSCURO, compartido };
  }

  if (asignado) {
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
      color: OSCURO,
      compartido,
    };
  }

  return {
    // El conductor no necesita franja en una alerta disponible: la tarjeta ya dice
    // el servicio, la hora, el recorrido y la tarifa.
    etiqueta: soyConductor ? '' : 'Buscando conductores',
    color: AZUL,
    compartido,
  };
}

/** La hora programada ya pasó (y el servicio no se cerró). */
export function estaVencido(service: ServiceAlert): boolean {
  if (!service.scheduled_at) return false;
  return new Date(service.scheduled_at).getTime() < Date.now();
}
