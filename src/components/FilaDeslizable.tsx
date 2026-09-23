/**
 * Una fila que se desliza hacia la IZQUIERDA para descubrir una acción a su derecha
 * («Archivar», «Desarchivar», «Cancelar postulación»).
 *
 * POR QUÉ EXISTE (22-09-2026)
 * ---------------------------
 * Antes esto era el `Swipeable` de `react-native-gesture-handler`, y en la web **rompía el
 * deslizamiento de la lista entera**: esa librería marca la vista del gesto con `touch-action: none`
 * —lo dice su propio código, «This one disables default events on Safari»—, así que en el iPhone,
 * cuando el dedo nace encima de una tarjeta, el navegador NO desplaza la lista. Con la pantalla llena
 * de tarjetas (justo el caso que reportó el usuario) la lista quedaba muerta: «no se puede deslizar».
 * Medido en su app: con 12 alertas, la lista tenía 24 elementos con `touch-action: none` (dos por
 * tarjeta) y el contenido medía 1.662 px dentro de 446 px visibles.
 *
 * Se hace con `PanResponder` —lo mismo que ya usan la barra de proceso y la barra del chat—, que no
 * toca `touch-action`, y **solo reclama el gesto si el movimiento es claramente horizontal**: si el
 * dedo va vertical, la lista se desplaza como siempre. Esa es la regla que hay que conservar: un
 * deslizamiento lateral NUNCA debe quedarse con un arrastre vertical.
 */
import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';

export interface FilaDeslizableRef {
  /** Devuelve la fila a su sitio (lo que hacía `Swipeable.close()`). */
  cerrar: () => void;
}

export interface FilaDeslizableProps {
  children: React.ReactNode;
  /** Lo que aparece a la derecha al deslizar (el botón que ya pinta cada pantalla). */
  accion: () => React.ReactNode;
  /** Ancho que se revela al abrir del todo. */
  anchoAccion?: number;
  /** Cuánto hay que arrastrar para que se abra. */
  umbral?: number;
  /** Se llama cuando la fila queda ABIERTA (equivale al viejo `onSwipeableOpen`). */
  alAbrir?: () => void;
}

/** Cuánto movimiento hace falta para distinguir un deslizamiento lateral de un desplazamiento. */
const MINIMO_HORIZONTAL = 10;
/** El lateral tiene que ganar por este factor al vertical para reclamar el gesto. */
const DOMINANCIA_HORIZONTAL = 1.5;

export const FilaDeslizable = forwardRef<FilaDeslizableRef, FilaDeslizableProps>(function FilaDeslizable(
  { children, accion, anchoAccion = 92, umbral = 40, alAbrir },
  ref
) {
  const desplazamiento = useRef(new Animated.Value(0)).current;
  // Refs para que el PanResponder (creado una sola vez) no capture valores viejos.
  const anchoRef = useRef(anchoAccion);
  const umbralRef = useRef(umbral);
  const alAbrirRef = useRef(alAbrir);
  anchoRef.current = anchoAccion;
  umbralRef.current = umbral;
  alAbrirRef.current = alAbrir;

  const animarA = (valor: number) => {
    Animated.timing(desplazamiento, {
      toValue: valor,
      duration: 160,
      useNativeDriver: false,
    }).start();
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Nunca se queda con el toque al empezar: así el toque normal de la tarjeta sigue funcionando.
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        // Solo si el movimiento es sobre todo HORIZONTAL y hacia la izquierda. Un arrastre vertical
        // (subir/bajar la lista) no se reclama nunca: eso es lo que deja desplazar la pantalla.
        onMoveShouldSetPanResponder: (_evento, gesto) => {
          const horizontal = Math.abs(gesto.dx);
          const vertical = Math.abs(gesto.dy);
          return gesto.dx < 0 && horizontal > MINIMO_HORIZONTAL && horizontal > vertical * DOMINANCIA_HORIZONTAL;
        },
        onPanResponderMove: (_evento, gesto) => {
          const ancho = anchoRef.current;
          desplazamiento.setValue(Math.max(-ancho, Math.min(0, gesto.dx)));
        },
        onPanResponderRelease: (_evento, gesto) => {
          const abrir = gesto.dx <= -umbralRef.current || gesto.vx < -0.6;
          if (abrir) {
            animarA(-anchoRef.current);
            alAbrirRef.current?.();
            return;
          }
          animarA(0);
        },
        onPanResponderTerminate: () => animarA(0),
        // Si otro (la lista) quiere el gesto, se le deja.
        onPanResponderTerminationRequest: () => true,
      }),
    [desplazamiento]
  );

  useImperativeHandle(ref, () => ({ cerrar: () => animarA(0) }), []);

  return (
    <View style={styles.fila}>
      {/* La acción vive DETRÁS, a la derecha: la tarjeta la va descubriendo al deslizarse. */}
      <View style={[styles.accion, { width: anchoAccion }]} pointerEvents="box-none">
        {accion()}
      </View>
      <Animated.View style={{ transform: [{ translateX: desplazamiento }] }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  fila: {
    position: 'relative',
  },
  accion: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
});
