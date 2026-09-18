/**
 * El "arrastre" al reordenar las tarjetas (Mis grupos).
 *
 * El usuario lo pidió así (18-09-2026): "un efecto de arrastre rápido pero armonioso
 * cuando se reordenan los grupos, muy similar al de las notas del iPhone cuando marcas y
 * desmarcas las casillas: se cambian de posición pero hay un arrastre muy armonioso".
 *
 * Cómo se consigue sin librerías nuevas (no hay `react-native-reanimated` en el
 * proyecto): la técnica **FLIP** —se calcula dónde estaba cada tarjeta ANTES del cambio y
 * dónde está DESPUÉS, se la pinta arrancando en su posición vieja y se la lleva a la nueva
 * con una animación—. Esta función es la parte que decide los desplazamientos (pura, sin
 * React, para poder probarla con node); el hook que anima está en
 * `hooks/useArrastreDeReordenamiento.ts`.
 */

/** Cuánto dura el arrastre: rápido, pero se ve el recorrido. */
export const DURACION_DEL_ARRASTRE_MS = 260;

/**
 * Desplazamiento inicial (en píxeles) de cada tarjeta que cambia de sitio.
 *
 * `altoDeFila` es el alto de una tarjeta MÁS la separación entre tarjetas: con eso el
 * desplazamiento inicial es exactamente la distancia entre su hueco viejo y el nuevo.
 * Positivo = viene de más abajo (sube), negativo = viene de más arriba (baja).
 *
 * Devuelve `{}` —o sea, no se anima nada— cuando la lista NO es la misma: si la lupa
 * filtró o entró/salió un grupo, no es un reordenamiento y las tarjetas no deben
 * deslizarse (el salto es lo esperado al filtrar).
 */
export function desplazamientosDelReordenamiento(
  ordenAnterior: readonly string[],
  ordenNuevo: readonly string[],
  altoDeFila: number
): Record<string, number> {
  if (altoDeFila <= 0) return {};
  if (ordenAnterior.length !== ordenNuevo.length) return {};

  const antes = new Set(ordenAnterior);
  for (const id of ordenNuevo) {
    if (!antes.has(id)) return {};
  }

  const desplazamientos: Record<string, number> = {};
  ordenNuevo.forEach((id, indice) => {
    const huecoAnterior = ordenAnterior.indexOf(id);
    if (huecoAnterior !== -1 && huecoAnterior !== indice) {
      desplazamientos[id] = (huecoAnterior - indice) * altoDeFila;
    }
  });
  return desplazamientos;
}

/** ¿Se movió alguna tarjeta? (para no animar cuando no hace falta). */
export function huboReordenamiento(
  ordenAnterior: readonly string[] | null,
  ordenNuevo: readonly string[]
): boolean {
  if (!ordenAnterior || ordenAnterior.length !== ordenNuevo.length) return false;
  return ordenNuevo.some((id, indice) => ordenAnterior[indice] !== id);
}
