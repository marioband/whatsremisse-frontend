/**
 * Colores de la app.
 *
 * Regla de significado (fijada con el usuario):
 *   - VERDE_ACCION = acciones positivas y mensajes positivos (aceptar, confirmar).
 *   - ROJO_ACCION  = acciones negativas y mensajes negativos (rechazar, error,
 *     cancelar).
 * El azul sigue siendo el color de marca y de las acciones neutras (chatear,
 * navegar); el oscuro es para cabeceras y avatares sin foto.
 *
 * Cambio de códigos (16/09/2026, pedido del usuario): el verde pasa de #358C52 a
 * #2E9E5B y el rojo de #9B3B43 a #C2333F. Se barrieron TODAS las copias literales
 * del código viejo en src (ver `/opt/data/.diag-bundle/barrido_paleta.py` y la
 * prueba `pruebas_paleta.js`, que falla si alguien vuelve a escribir el viejo).
 */

export const AZUL = '#3F51B5';
export const OSCURO = '#2D2D2D';
export const VERDE_ACCION = '#2E9E5B';
export const ROJO_ACCION = '#C2333F';

/**
 * Verde del deslizamiento: el relleno que sigue al pulgar y el pulgar mismo en la
 * barra de proceso. Es más claro que VERDE_ACCION a propósito (modelo del usuario):
 * sobre el fondo #2E9E5B la zona deslizable se lee como "avanza".
 */
export const VERDE_DESLIZABLE = '#00D647';

/** Fondo de tarjeta y separadores, ya usados en las pantallas. */
export const FONDO_TARJETA = '#F2F2F2';
export const BORDE_SUAVE = '#E2E2E2';

export const TEXTO = '#111111';
export const TEXTO_SUAVE = '#444444';
export const TEXTO_TENUE = '#888888';

/**
 * Colores de las tarjetas de **Mis grupos**, por categoría (pedido del usuario):
 * primero los que soy propietario, después los que administro, luego mis favoritos y al
 * final los que solo integro.
 *
 * Colores fijados por el usuario el 18-09-2026 (3ª corrección del día): **favorito y
 * integrante comparten `#F2F2F2`** (el mismo tono que las tarjetas de servicio), el
 * administrador `#B8B8B8` y el propietario `#B8BED8`.
 *
 * Códigos cambiados el 18-09-2026 (2ª vuelta del día): propietario de #8B8FE8 a
 * #B8BED8, administrador de #7FD8C9 a #B8B8B8 y favorito de #F5E17A a #F2F2F2.
 */
export const GRUPO_PROPIETARIO = '#B8BED8';
export const GRUPO_ADMIN = '#B8B8B8';
export const GRUPO_FAVORITO = '#F2F2F2';
export const GRUPO_INTEGRANTE = '#F2F2F2';

/**
 * El corazón de las tarjetas de grupo: el MISMO color con el borde (♡) y relleno (♥),
 * como pidió el usuario. Antes era rosa y solo cambiaba de glifo.
 */
export const CORAZON_DE_GRUPO = '#333333';
