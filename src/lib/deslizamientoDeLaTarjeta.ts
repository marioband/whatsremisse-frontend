/**
 * Qué hace el deslizamiento de la tarjeta (hacia la IZQUIERDA) en el inicio del CONDUCTOR.
 *
 * Regla del usuario (18-09-2026): cuando el conductor **ya se postuló** a un servicio y
 * desiste, el deslizamiento **cancela su postulación** —no archiva el servicio— y la tarjeta
 * se queda en «Disponibles» para poder volver a postularse. Si no está postulado, el
 * deslizamiento **archiva** (esconder un servicio que no le interesa), que es lo que pidió
 * un rato antes ese mismo día.
 *
 * El texto y la acción tienen que decir LO MISMO (el usuario lo reportó): por eso la etiqueta
 * y lo que se ejecuta salen de la misma función, aquí, y no de un `if` suelto en la tarjeta.
 *
 * Módulo PURO (sin React): así las reglas se prueban con node sobre los casos reales.
 */

export type AccionDelDeslizamiento = 'ARCHIVAR' | 'DESARCHIVAR' | 'CANCELAR_POSTULACION';

/** Tono del botón; la tarjeta lo traduce a los colores de `constants/colors`. */
export type TonoDelDeslizamiento = 'AZUL' | 'GRIS' | 'ROJO';

export interface PlanDelDeslizamiento {
  accion: AccionDelDeslizamiento;
  etiqueta: string;
  tono: TonoDelDeslizamiento;
}

export const ETIQUETA_ARCHIVAR = 'Archivar';
export const ETIQUETA_DESARCHIVAR = 'Desarchivar';
export const ETIQUETA_CANCELAR_POSTULACION = 'Cancelar postulación';

/**
 * Plan del deslizamiento.
 *
 *  - archivada        → «Desarchivar» (la tarjeta vive en «Archivados»).
 *  - postulación viva → «Cancelar postulación»: el conductor sale de la cola y el servicio
 *                       sigue disponible para él (puede volver a postularse).
 *  - cualquier otro   → «Archivar».
 */
export function planDelDeslizamiento(datos: {
  archivada?: boolean;
  postulacionViva?: boolean;
}): PlanDelDeslizamiento {
  if (datos.archivada) {
    return { accion: 'DESARCHIVAR', etiqueta: ETIQUETA_DESARCHIVAR, tono: 'AZUL' };
  }
  if (datos.postulacionViva) {
    return {
      accion: 'CANCELAR_POSTULACION',
      etiqueta: ETIQUETA_CANCELAR_POSTULACION,
      tono: 'ROJO',
    };
  }
  return { accion: 'ARCHIVAR', etiqueta: ETIQUETA_ARCHIVAR, tono: 'GRIS' };
}

/**
 * Lo que se le dice al conductor después de cancelar. Se avisa porque la tarjeta se queda
 * igual de visible (sin postulación): sin este mensaje parecería que el deslizamiento no
 * hizo nada.
 */
export const AVISO_POSTULACION_CANCELADA = {
  titulo: 'Postulación cancelada',
  cuerpo:
    'Solo se canceló tu postulación: el servicio sigue en «Disponibles» y puedes volver a postularte.',
  boton: 'Aceptar',
};

/** Aviso cuando la cancelación no llegó a la base (no se toca nada en pantalla). */
export const AVISO_CANCELACION_FALLIDA = {
  titulo: 'No se pudo cancelar',
  cuerpo: 'Revisa tu conexión e intenta de nuevo: tu postulación sigue en pie.',
  boton: 'Aceptar',
};
