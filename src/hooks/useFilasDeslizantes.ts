/**
 * Las filas que se DESLIZAN cuando cambian de sitio (la técnica FLIP, con su medición).
 *
 * POR QUÉ EXISTE: el efecto se pidió primero para Mis grupos (18-09-2026, «como las notas del
 * iPhone cuando marcas y desmarcas las casillas») y el usuario lo volvió a pedir el 20-09-2026
 * para las **tarjetas de servicios**. La animación ya estaba en
 * `hooks/useArrastreDeReordenamiento`; lo que se repite en cada pantalla es lo de alrededor:
 * medir el alto de una fila y repartir el valor de cada tarjeta. Eso vive aquí, una sola vez.
 *
 * CÓMO SE USA (las tres cosas van juntas):
 *   const { valorDe, medirLaFila } = useFilasDeslizantes(ids, margenEntreTarjetas);
 *   <Animated.View style={{ transform: [{ translateY: valorDe(item.id) }] }} onLayout={medirLaFila(index)}>
 *
 * TRAMPA MEDIDA (por eso el alto se mide y no se supone): en web el `layout.y` de las filas de
 * un `FlatList` llega **0 en todas** (`react-native-web` no lo rellena), así que la distancia
 * entre filas no sirve sola; se usa el `layout.height`, que en web ya trae dentro el
 * `marginBottom` de la tarjeta y en nativo **no** (de ahí el `margen` aparte).
 */
import { useRef, useState } from 'react';
import { LayoutChangeEvent, Platform } from 'react-native';

import { useArrastreDeReordenamiento } from './useArrastreDeReordenamiento';

export function useFilasDeslizantes(idsEnOrden: readonly string[], margenEntreTarjetas: number) {
  /** El alto de una fila (tarjeta + separación): lo que se desliza. */
  const [altoDeFila, setAltoDeFila] = useState(0);
  const posiciones = useRef<Record<number, number>>({});

  const { valorDe } = useArrastreDeReordenamiento(idsEnOrden, altoDeFila);

  const medirLaFila = (indice: number) => (evento: LayoutChangeEvent) => {
    const { y, height } = evento.nativeEvent.layout;
    posiciones.current[indice] = y;
    const siguiente = posiciones.current[indice + 1];
    const distancia = siguiente === undefined ? 0 : Math.abs(siguiente - y);
    const alto =
      distancia > 0 ? distancia : Platform.OS === 'web' ? height : height + margenEntreTarjetas;
    if (alto > 0 && Math.abs(alto - altoDeFila) > 0.5) setAltoDeFila(alto);
  };

  return { valorDe, medirLaFila, altoDeFila };
}
