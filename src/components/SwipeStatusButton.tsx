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

import { VERDE_ACCION } from '../lib/colors';

const TRACK_HEIGHT = 54;
const THUMB_SIZE = 46;
/** Cuánto hay que arrastrar (0-1 del ancho) para que cuente como deslizado. */
const UMBRAL = 0.55;

export interface SwipeState {
  label: string;
  color: string;
}

interface GenericProps {
  states: SwipeState[];
  currentIndex: number;
  onAdvance: (nextIndex: number) => void;
  disabled?: boolean;
}

interface RoleProps {
  role: 'DRIVER' | 'PROVIDER';
  /** El deslizamiento solo existe durante el viaje: al finalizar pasa al pago. */
  step: 'IN_PROGRESS';
  progressIndex?: number;
  onAdvance: () => void;
  disabled?: boolean;
}

type Props = GenericProps | RoleProps;

function isGeneric(props: Props): props is GenericProps {
  return 'states' in props;
}

/** Hitos del viaje, en el vocabulario de la app: Ubicado → En proceso → Finalizado. */
const ETAPAS = ['Ubicado', 'En proceso', 'Finalizado'];

function buildRoleStates(): SwipeState[] {
  return ETAPAS.map((label) => ({ label, color: VERDE_ACCION }));
}

const clamp = (valor: number, minimo: number, maximo: number) =>
  Math.max(minimo, Math.min(valor, maximo));

/**
 * Barra de reporte del viaje.
 *
 * El gesto se atiende en TODA la barra (no solo en el pulgar) y el pulgar sigue
 * al dedo usando la posición absoluta del toque contra el borde medido de la
 * barra: antes solo se movía agarrando el círculo exacto y con el
 * desplazamiento relativo, y por eso "no respondía bien".
 */
export function SwipeStatusButton(props: Props) {
  const generic = isGeneric(props);
  const step = generic ? undefined : props.step;
  const progressIndex = generic ? undefined : (props.progressIndex ?? 0);

  const states = generic ? props.states : buildRoleStates();
  const currentIndex = generic ? props.currentIndex : (progressIndex ?? 0);
  const disabled = Boolean(props.disabled);

  const [dragging, setDragging] = useState(false);
  const [listo, setListo] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);

  const translateX = useRef(new Animated.Value(0)).current;
  const trackRef = useRef<View>(null);
  /** Borde izquierdo de la barra en la pantalla, para convertir el toque. */
  const pageXRef = useRef(0);
  const anchoRef = useRef(0);
  const maxTranslate = Math.max(trackWidth - THUMB_SIZE - 8, 1);

  const current = states[currentIndex] || states[states.length - 1];
  // Durante el viaje siempre hay algo que reportar (el último hito es la última
  // vez que se desliza): después de eso la zona pasa a la interfaz de pago.
  const isFinal = generic
    ? disabled || currentIndex >= states.length - 1
    : disabled || step !== 'IN_PROGRESS';

  const resetThumb = () => {
    translateX.setValue(0);
  };

  useEffect(() => {
    resetThumb();
  }, [currentIndex, states.length]);

  // Refs para que el PanResponder (creado una sola vez) no capture valores viejos
  const propsRef = useRef({ generic, onAdvance: props.onAdvance, currentIndex, disabled });
  useEffect(() => {
    propsRef.current = { generic, onAdvance: props.onAdvance, currentIndex, disabled };
  }, [generic, props.onAdvance, currentIndex, disabled]);

  const medir = () => {
    trackRef.current?.measureInWindow((x, _y, width) => {
      pageXRef.current = x;
      anchoRef.current = width;
      setTrackWidth((actual) => (Math.abs(actual - width) > 1 ? width : actual));
    });
  };

  /** Posición del dedo dentro de la barra (0 = borde izquierdo). */
  const posicionEnBarra = (gesture: PanResponderGestureState, locationX: number) => {
    const ancho = anchoRef.current || trackWidth;
    if (!ancho) return 0;
    const absoluta = gesture.moveX - pageXRef.current;
    // Si la medición del borde no está disponible, se usa el relativo al toque.
    const dentro = pageXRef.current > 0 ? absoluta : locationX;
    return clamp(dentro, 0, ancho);
  };

  const pintarArrastre = (dentro: number) => {
    const ancho = anchoRef.current || trackWidth || 1;
    const desplazamiento = clamp(dentro - THUMB_SIZE / 2, 0, maxTranslateValue());
    translateX.setValue(desplazamiento);
    setListo(dentro / ancho >= UMBRAL);
  };

  const maxTranslateValue = () => {
    const ancho = anchoRef.current || trackWidth;
    return Math.max(ancho - THUMB_SIZE - 8, 1);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !propsRef.current.disabled,
      onMoveShouldSetPanResponder: () => !propsRef.current.disabled,
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
        const ancho = anchoRef.current || trackWidth || 1;
        const dentro = posicionEnBarra(gesture, evt.nativeEvent.locationX);
        const avanza = dentro / ancho >= UMBRAL;

        setDragging(false);
        setListo(false);
        resetThumb();

        if (!avanza) return;
        const { generic: isGen, onAdvance, currentIndex: idx } = propsRef.current;
        if (isGen) {
          (onAdvance as (nextIndex: number) => void)(idx + 1);
        } else {
          (onAdvance as () => void)();
        }
      },
      onPanResponderTerminate: () => {
        setDragging(false);
        setListo(false);
        resetThumb();
      },
    })
  ).current;

  const progressWidth = translateX.interpolate({
    inputRange: [0, maxTranslate],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  const onLayout = (_event: LayoutChangeEvent) => {
    medir();
  };

  return (
    <View style={styles.container}>
      <View
        ref={trackRef}
        style={[styles.track, { backgroundColor: current.color }]}
        onLayout={onLayout}
        {...panResponder.panHandlers}
      >
        <Animated.View
          style={[
            styles.fill,
            { backgroundColor: current.color, width: progressWidth, opacity: isFinal ? 1 : 0.85 },
          ]}
        />
        <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit>
          {dragging && listo ? 'Suelta para confirmar' : current.label}
        </Text>
        {!isFinal && (
          <Animated.View style={[styles.thumb, { transform: [{ translateX }] }]}>
            <Text style={styles.thumbIcon}>{listo ? '✓' : '→'}</Text>
          </Animated.View>
        )}
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
    opacity: 0.85,
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    zIndex: 1,
    paddingHorizontal: THUMB_SIZE + 12,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  thumb: {
    position: 'absolute',
    left: 4,
    top: (TRACK_HEIGHT - THUMB_SIZE) / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  thumbIcon: {
    color: '#2D2D2D',
    fontSize: 20,
    fontWeight: 'bold',
  },
});
