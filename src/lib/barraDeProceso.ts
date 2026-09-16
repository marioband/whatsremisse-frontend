/**
 * Estado visual de la barra de proceso (el deslizamiento que reporta el viaje).
 *
 * El modelo del usuario (imagen `dashboard_20260916_145538`) tiene cuatro
 * fotogramas y aquí está cada uno en una función pura, para poder probarlos sin
 * renderizar:
 *
 *   1. en reposo      → pulgar a la izquierda con la flecha, texto = hito a reportar
 *   2. arrastrando    → el relleno claro sigue al pulgar y el texto sigue centrado
 *   3. completado     → relleno al 100 %, flecha al extremo derecho, SIN texto
 *   4. en reposo      → igual que el 1, con el hito siguiente
 *
 * Colores (fijados por el usuario): fondo de la barra y flecha #2E9E5B, relleno y
 * pulgar #00D647. Los aplica el componente con los tokens de `lib/colors.ts`.
 */

/** Hitos del viaje: el vocabulario fijado con el usuario. */
export const ETAPAS = ['Ubicado', 'En proceso', 'Finalizado'] as const;

/** Cuánto hay que arrastrar (0-1 del ancho de la barra) para que cuente como deslizado. */
export const UMBRAL = 0.55;

/** Texto mientras el arrastre ya pasó el umbral (el que avisa que se puede soltar). */
export const AVISO_SOLTAR = 'Suelta para confirmar';

/** Milisegundos del fotograma "completado" antes de reportar el hito. */
export const VUELO_MS = 280;

export type IconoDeBarra = 'arrow-right-bold' | 'check-bold';

export interface FotogramaDeBarra {
  /** Texto del centro. Vacío = sin texto (fotograma "completado"). */
  etiqueta: string;
  icono: IconoDeBarra;
}

/** Texto del hito que se reporta al deslizar ahora (0..2). Fuera de rango se limita. */
export function etiquetaDelHito(progressIndex: number): string {
  const indice = indiceValido(progressIndex);
  return ETAPAS[indice];
}

function indiceValido(progressIndex: number): number {
  if (!Number.isFinite(progressIndex)) return 0;
  return Math.min(Math.max(Math.trunc(progressIndex), 0), ETAPAS.length - 1);
}

/**
 * Fotograma que hay que pintar.
 *
 * - `volando`: acaba de soltarse a la derecha y el pulgar viaja al extremo; se oculta
 *   el texto (fotograma 3) hasta que el padre cambie al hito siguiente.
 * - `arrastrando` + `listo`: el arrastre pasó el umbral → "Suelta para confirmar".
 */
export function fotogramaDeBarra(datos: {
  progressIndex: number;
  arrastrando: boolean;
  listo: boolean;
  volando: boolean;
}): FotogramaDeBarra {
  if (datos.volando) return { etiqueta: '', icono: 'arrow-right-bold' };
  if (datos.arrastrando && datos.listo) return { etiqueta: AVISO_SOLTAR, icono: 'check-bold' };
  return { etiqueta: etiquetaDelHito(datos.progressIndex), icono: 'arrow-right-bold' };
}

/**
 * Ancho del relleno claro, en fracción del recorrido del pulgar (0-1). El relleno y
 * el pulgar son el mismo color: el relleno marca hasta dónde llegó el arrastre.
 */
export function avanceDeLaBarra(dentro: number, ancho: number): number {
  if (!ancho || ancho <= 0) return 0;
  return Math.min(Math.max(dentro / ancho, 0), 1);
}

/** ¿El arrastre llegó al umbral? (decide si al soltar se reporta o vuelve al inicio). */
export function llegoAlUmbral(dentro: number, ancho: number): boolean {
  return avanceDeLaBarra(dentro, ancho) >= UMBRAL;
}
