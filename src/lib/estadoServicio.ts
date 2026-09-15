import { AZUL, OSCURO, ROJO_ACCION, TEXTO_TENUE, VERDE_ACCION } from './colors';
import { ServiceAlert } from '../types';

export interface EstadoServicio {
  etiqueta: string;
  color: string;
  /** El servicio ya se compartió a algún grupo (o sea: salió de "nuevo servicio"). */
  compartido: boolean;
}

/**
 * Estado que comunica la barra inferior de una tarjeta de servicio.
 *
 * Es la única fuente de verdad de las señales del proceso: la tarjeta no decide
 * nada por su cuenta, solo pinta lo que devuelve esta función. El reporte del
 * conductor aceptado (`driver_progress_step`) es el que va moviendo la señal.
 *
 *   no compartido → buscando conductores → (x) postulantes → en camino →
 *   conductor ubicado → servicio en proceso → servicio finalizado
 *
 * `Servicio vencido` aparece cuando la hora programada ya pasó y nadie lo tomó.
 * `Servicio anulado` es el resto (cancelado sin cerrarse).
 */
export function estadoDeServicio(service: ServiceAlert, postulantesPendientes = 0): EstadoServicio {
  const paso = service.driver_progress_step ?? 0;
  const asignado = !!service.assigned_driver_id;
  const compartido = !!service.group_id;

  if (service.status === 'STATUS_CANCELLED') {
    return { etiqueta: 'Servicio anulado', color: ROJO_ACCION, compartido };
  }

  if (service.status === 'STATUS_COMPLETED' || paso >= 3) {
    return { etiqueta: 'Servicio Finalizado', color: VERDE_ACCION, compartido };
  }

  if (asignado) {
    if (paso === 1) return { etiqueta: 'Conductor ubicado', color: OSCURO, compartido };
    if (paso === 2) return { etiqueta: 'Servicio en Proceso', color: OSCURO, compartido };
    return { etiqueta: 'En camino', color: AZUL, compartido };
  }

  if (!compartido) {
    return { etiqueta: 'Servicio no compartido', color: TEXTO_TENUE, compartido };
  }

  if (estaVencido(service)) {
    return { etiqueta: 'Servicio vencido', color: ROJO_ACCION, compartido };
  }

  if (postulantesPendientes > 0) {
    return {
      etiqueta:
        postulantesPendientes === 1 ? '1 Postulante' : `${postulantesPendientes} Postulantes`,
      color: OSCURO,
      compartido,
    };
  }

  return { etiqueta: 'Buscando conductores', color: AZUL, compartido };
}

/** La hora programada ya pasó (y el servicio no se cerró). */
export function estaVencido(service: ServiceAlert): boolean {
  if (!service.scheduled_at) return false;
  return new Date(service.scheduled_at).getTime() < Date.now();
}
