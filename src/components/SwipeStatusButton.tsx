import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  Animated,
  LayoutChangeEvent,
  PanResponderGestureState,
} from 'react-native';

import { avanceDeLaBarra, fotogramaDeBarra, llegoAlUmbral, VUELO_MS } from '../lib/barraDeProceso';
import { VERDE_ACCION, VERDE_DESLIZABLE } from '../lib/colors';

const TRACK_HEIGHT = 54;
const THUMB_SIZE = 44;
/** Separación del pulgar con el borde izquierdo de la barra. */
const MARGEN = 5;
/** Cuadrado redondeado, no círculo (modelo del usuario). */
const THUMB_RADIO = 8;
/** Tamaño del glifo de la flecha dentro del pulgar (proporción del modelo: el
 *  glifo ocupa ~2/3 del ancho del pulgar). */
const ICONO_PX = 40;

const clamp = (valor: number, minimo: number, maximo: number) =>
  Math.max(minimo, Math.min(valor, maximo));

interface Props {
  /** Hito que se reporta al deslizar: 0 = Ubicado, 1 = En proceso, 2 = Finalizado. */
  progressIndex: number;
  onAdvance: () => void;
}

/**
 * Barra de proceso del viaje (modelo del usuario, imagen
 * `dashboard_20260916_145538`): fondo verde oscuro con la flecha, pulgar cuadrado
 * redondeado y relleno en verde claro, texto centrado con el hito que se reporta.
 *
 * El gesto se atiende en TODA la barra (no solo en el pulgar) y el pulgar sigue al
 * dedo usando la posición absoluta del toque contra el borde medido de la barra.
 * Al soltar pasado el umbral, el pulgar viaja al extremo (fotograma "completado":
 * barra llena y sin texto) y recién entonces se reporta el hito.
 */
export function SwipeStatusButton({ progressIndex, onAdvance }: Props) {
  const [dragging, setDragging] = useState(false);
  const [listo, setListo] = useState(false);
  const [volando, setVolando] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);

  const translateX = useRef(new Animated.Value(0)).current;
  /** Fracción del ancho ya recorrida (0-1): el ancho del relleno claro. */
  const relleno = useRef(new Animated.Value(0)).current;
  const trackRef = useRef<View>(null);
  /** Borde izquierdo de la barra en la pantalla, para convertir el toque. */
  const pageXRef = useRef(0);
  const anchoRef = useRef(0);

  const anchoDeBarra = () => anchoRef.current || trackWidth || 0;
  const maxTranslateValue = () => Math.max(anchoDeBarra() - THUMB_SIZE - MARGEN, 1);

  const fotograma = fotogramaDeBarra({ progressIndex, arrastrando: dragging, listo, volando });

  const resetThumb = () => {
    translateX.setValue(0);
    relleno.setValue(0);
  };

  useEffect(() => {
    resetThumb();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressIndex]);

  // Refs para que el PanResponder (creado una sola vez) no capture valores viejos
  const propsRef = useRef({ onAdvance, progressIndex });
  const estadoRef = useRef({ volando: false });
  useEffect(() => {
    propsRef.current = { onAdvance, progressIndex };
  }, [onAdvance, progressIndex]);
  useEffect(() => {
    estadoRef.current = { volando };
  }, [volando]);

  const medir = () => {
    trackRef.current?.measureInWindow((x, _y, width) => {
      pageXRef.current = x;
      anchoRef.current = width;
      setTrackWidth((actual) => (Math.abs(actual - width) > 1 ? width : actual));
    });
  };

  /** Posición del dedo dentro de la barra (0 = borde izquierdo). */
  const posicionEnBarra = (gesture: PanResponderGestureState, locationX: number) => {
    const ancho = anchoDeBarra();
    if (!ancho) return 0;
    const absoluta = gesture.moveX - pageXRef.current;
    // Si la medición del borde no está disponible, se usa el relativo al toque.
    const dentro = pageXRef.current > 0 ? absoluta : locationX;
    return clamp(dentro, 0, ancho);
  };

  const pintarArrastre = (dentro: number) => {
    const ancho = anchoDeBarra() || 1;
    const desplazamiento = clamp(dentro - THUMB_SIZE / 2, 0, maxTranslateValue());
    translateX.setValue(desplazamiento);
    // El relleno llega hasta el borde derecho del pulgar (mismo color: se lee como uno).
    relleno.setValue(avanceDeLaBarra(MARGEN + desplazamiento + THUMB_SIZE, ancho));
    setListo(llegoAlUmbral(dentro, ancho));
  };

  const panResponder = useRef(
    PanResponder.create({
      // Mientras el pulgar viaja al extremo no se atiende otro gesto.
      onStartShouldSetPanResponder: () => !estadoRef.current.volando,
      onMoveShouldSetPanResponder: () => !estadoRef.current.volando,
      // El gesto no se cede a la lista ni al scroll mientras se arrastra.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        setDragging(true);
        setListo(false);
      },
      onPanResponderMove: (evt, gesture: PanResponderGestureState) => {
        const dentro = posicionEnBarra(gesture, evt.nativeEvent.locationX);
        pintarArrastre(dentro);
      },
      onPanResponderRelease: (evt, gesture: PanResponderGestureState) => {
        const ancho = anchoDeBarra() || 1;
        const dentro = posicionEnBarra(gesture, evt.nativeEvent.locationX);

        setDragging(false);
        setListo(false);

        if (!llegoAlUmbral(dentro, ancho)) {
          // No llegó: el pulgar vuelve solo al inicio.
          Animated.timing(translateX, {
            toValue: 0,
            duration: 160,
            useNativeDriver: false,
          }).start(() => relleno.setValue(0));
          return;
        }

        // Fotograma "completado" del modelo: barra llena, flecha al extremo y sin
        // texto. Cuando termina el viaje del pulgar recién se reporta el hito, así
        // el padre cambia el texto al hito siguiente (o entra la zona de pago).
        setVolando(true);
        setListo(false);
        Animated.parallel([
          Animated.timing(translateX, {
            toValue: maxTranslateValue(),
            duration: VUELO_MS,
            useNativeDriver: false,
          }),
          Animated.timing(relleno, {
            toValue: 1,
            duration: VUELO_MS,
            useNativeDriver: false,
          }),
        ]).start(() => {
          setVolando(false);
          propsRef.current.onAdvance();
          resetThumb();
        });
      },
      onPanResponderTerminate: () => {
        setDragging(false);
        setListo(false);
        resetThumb();
      },
    })
  ).current;

  const anchoRelleno = relleno.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  const onLayout = (_event: LayoutChangeEvent) => {
    medir();
  };

  return (
    <View style={styles.container}>
      <View ref={trackRef} style={styles.track} onLayout={onLayout} {...panResponder.panHandlers}>
        <Animated.View style={[styles.fill, { width: anchoRelleno }]} />

        {!!fotograma.etiqueta && (
          <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit>
            {fotograma.etiqueta}
          </Text>
        )}

        <Animated.View style={[styles.thumb, { transform: [{ translateX }] }]}>
          <MaterialCommunityIcons name={fotograma.icono} size={ICONO_PX} color={VERDE_ACCION} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  track: {
    width: '100%',
    height: TRACK_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
    // Fondo de la barra (modelo: #2E9E5B).
    backgroundColor: VERDE_ACCION,
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    // Relleno que sigue al pulgar (modelo: #00D647).
    backgroundColor: VERDE_DESLIZABLE,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    // Debajo del pulgar: el modelo deja que el pulgar pase por encima del texto.
    zIndex: 1,
  },
  thumb: {
    position: 'absolute',
    left: MARGEN,
    top: (TRACK_HEIGHT - THUMB_SIZE) / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_RADIO,
    // Cuadrado redondeado del mismo color que el relleno: la flecha lo distingue.
    backgroundColor: VERDE_DESLIZABLE,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
});
