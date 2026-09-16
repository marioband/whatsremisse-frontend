import { ServiceAlert } from '../types';

/**
 * Qué hace el proveedor cuando toca una tarjeta de su inicio.
 *
 * Reglas fijadas con el usuario (dos casos reportados):
 *   1. Si el servicio **ya tiene conductor** (aceptado, en proceso o terminado), el
 *      toque abre el CHAT. Nunca el editor: antes, una alerta con hora específica ya
 *      pasada caía en la rama de "vencida en gracia" y abría el editor aunque el
 *      viaje estuviera en curso.
 *   2. Si **no hay ningún postulante**, el toque abre el servicio completo para
 *      editarlo como si se lanzara de nuevo. Antes salía un aviso de "Sin
 *      postulantes" que no dejaba hacer nada.
 *
 * El orden manda: tiene conductor > postulantes > editar. Así el caso 1 no puede
 * volver a caer en el editor por estar vencida.
 */
export type DestinoDeLaTarjeta = 'CHAT' | 'EDITAR' | 'POSTULANTES';

export interface DatosDeLaTarjetaDelProveedor {
  /** El servicio ya tiene conductor asignado (aceptado, en proceso o terminado). */
  tieneConductor: boolean;
  /** La alerta está compartida a algún grupo (o sea: ya salió de "nuevo servicio"). */
  compartido: boolean;
  /** Vencida, pero todavía dentro de las 24 h para reprogramarla y reenviarla. */
  vencidaEnGracia: boolean;
  /** Postulantes esperando respuesta. */
  postulantesPendientes: number;
}

export function destinoDeLaTarjetaDelProveedor(
  datos: DatosDeLaTarjetaDelProveedor
): DestinoDeLaTarjeta {
  // 1. El viaje ya es de alguien: la conversación es el único sitio donde se actúa
  //    (ahí vive el avance y, al terminar, el cuadre de pagos).
  if (datos.tieneConductor) return 'CHAT';

  // 2. Alertas que hay que terminar de configurar: sin compartir, o vencidas dentro
  //    de la gracia (para reprogramarlas).
  if (!datos.compartido) return 'EDITAR';
  if (datos.vencidaEnGracia) return 'EDITAR';

  // 3. Hay gente esperando respuesta: su lista (aceptar / conversar / rechazar).
  if (datos.postulantesPendientes > 0) return 'POSTULANTES';

  // 4. Alerta compartida y sin nadie postulado: se edita por completo, como si se
  //    acabara de lanzar (antes solo se avisaba "Sin postulantes").
  return 'EDITAR';
}

/** Lo mismo, calculado desde la fila del servicio. */
export function destinoDeLaTarjetaDe(
  service: ServiceAlert,
  postulantesPendientes: number,
  constantes: { compartido: boolean; vencidaEnGracia: boolean }
): DestinoDeLaTarjeta {
  return destinoDeLaTarjetaDelProveedor({
    tieneConductor: !!service.assigned_driver_id,
    compartido: constantes.compartido,
    vencidaEnGracia: constantes.vencidaEnGracia,
    postulantesPendientes,
  });
}
