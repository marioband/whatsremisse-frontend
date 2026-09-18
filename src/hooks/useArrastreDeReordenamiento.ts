/**
 * El arrastre al reordenar (técnica FLIP) con `Animated` de React Native.
 *
 * `react-native-reanimated` NO está instalado en el proyecto (el build web avisa de que
 * falta), así que se usa `Animated`, que funciona igual en web y en nativo. Reglas que
 * sigue este hook, aprendidas de los fallos de otros reordenamientos:
 *
 *   - Cada tarjeta tiene SU valor (`Animated.Value`) guardado por id, y se reutiliza
 *     mientras la tarjeta siga en la lista: si se creara en cada render, la animación se
 *     cortaría a la mitad.
 *   - El desplazamiento inicial sale de `lib/reordenar.ts` (lógica pura y probada): el
 *     hook solo lo aplica y lo anima a 0.
 *   - **Cuando la lista no es la misma (la lupa filtró, entró un grupo) no se anima**: el
 *     cambio de conjunto no es un reordenamiento.
 *   - `useNativeDriver` se enciende solo fuera de web (en web `Animated` no tiene módulo
 *     nativo y avisaría por consola sin aportar nada).
 */
import { useLayoutEffect, useRef } from 'react';
import { Animated, Easing, Platform } from 'react-native';

import { DURACION_DEL_ARRASTRE_MS, desplazamientosDelReordenamiento } from '../lib/reordenar';

export function useArrastreDeReordenamiento(idsEnOrden: readonly string[], altoDeFila: number) {
  const valores = useRef<Record<string, Animated.Value>>({});
  const ordenAnterior = useRef<readonly string[] | null>(null);
  /** El orden actual, para el efecto, sin que entre en las dependencias del efecto. */
  const idsActuales = useRef<readonly string[]>(idsEnOrden);
  idsActuales.current = idsEnOrden;
  const claveDeOrden = idsEnOrden.join('|');

  /**
   * El valor de la tarjeta: el suyo si ya existía, o uno nuevo (la primera vez que se
   * pinta esa tarjeta).
   */
  const valorDe = (id: string): Animated.Value => {
    const actual = valores.current[id];
    if (actual) return actual;
    const nuevo = new Animated.Value(0);
    valores.current[id] = nuevo;
    return nuevo;
  };

  useLayoutEffect(() => {
    const ids = idsActuales.current;
    const desplazamientos = desplazamientosDelReordenamiento(
      ordenAnterior.current ?? [],
      ids,
      altoDeFila
    );

    ids.forEach((id) => {
      const valor = valorDe(id);
      const desplazamiento = desplazamientos[id];
      if (desplazamiento) {
        // Arranca donde estaba y se desliza hasta su hueco nuevo.
        valor.setValue(desplazamiento);
        Animated.timing(valor, {
          toValue: 0,
          duration: DURACION_DEL_ARRASTRE_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: Platform.OS !== 'web',
        }).start();
      } else {
        valor.setValue(0);
      }
    });

    // Las tarjetas que ya no están no dejan su valor colgando.
    const vigentes = new Set(ids);
    Object.keys(valores.current).forEach((id) => {
      if (!vigentes.has(id)) delete valores.current[id];
    });

    ordenAnterior.current = ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveDeOrden, altoDeFila]);

  return { valorDe };
}
