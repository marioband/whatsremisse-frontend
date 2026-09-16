/**
 * Apilado (zIndex) de los campos con sugerencias en react-native-web.
 *
 * El bug que esto arregla: en "nuevo servicio" el desplegable del **distrito de
 * origen** quedaba tapado por el campo **Destino 1**. En web el zIndex que decide
 * quién se pinta encima es el de la FILA que contiene el campo, no el del
 * desplegable: si dos filas comparten zIndex, gana la que va DESPUÉS en el
 * documento (el destino), y el desplegable de la de arriba queda detrás.
 *
 * Regla: la fila con el desplegable abierto se levanta sobre todas las demás; las
 * demás quedan en la capa base. Así da igual el orden en el formulario y cuántos
 * destinos se agreguen.
 */

/** Capa base: todas las filas con sugerencias cerradas. */
export const Z_FILA = 1000;

/** Capa de la fila que tiene su desplegable abierto. */
export const Z_FILA_ABIERTA = 2000;

/**
 * zIndex de la fila `fila` sabiendo cuál tiene el desplegable abierto (`abierta`,
 * `null` si ninguno).
 */
export function zIndexDeFila(abierta: string | null, fila: string): number {
  return abierta === fila ? Z_FILA_ABIERTA : Z_FILA;
}

/** Identificador de cada fila con sugerencias (origen y destinos). */
export const FILA_ORIGEN = 'origen';

export function filaDestino(indice: number): string {
  return `destino-${indice}`;
}
