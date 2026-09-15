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

const TRACK_HEIGHT = 50;
const THUMB_SIZE = 42;
/** Cuánto hay que arrastrar (0-1 del ancho) para que cuente como deslizado. */
const UMBRAL = 0.6;

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
  step: 'IN_PROGRESS' | 'COMMISSION_PAID' | 'PAYMENT_RECEIVED' | 'FINISHED';
  progressIndex?: number;
  onAdvance: () => void;
  /** Sin nada más que reportar (p. ej. servicio finalizado sin cuadre). */
  disabled?: boolean;
}

type Props = GenericProps | RoleProps;

function isGeneric(props: Props): props is GenericProps {
  return 'states' in props;
}

/** Hitos del viaje, en el vocabulario de la app: Ubicado → En proceso → Finalizado. */
const ETAPAS = ['Ubicado', 'En proceso', 'Finalizado'];

function buildRoleStates(
  role: 'DRIVER' | 'PROVIDER',
  step: 'IN_PROGRESS' | 'COMMISSION_PAID' | 'PAYMENT_RECEIVED' | 'FINISHED'
): SwipeState[] {
  if (step === 'IN_PROGRESS') {
    return ETAPAS.map((label) => ({ label, color: VERDE_ACCION }));
  }
  if (step === 'COMMISSION_PAID') {
    return [
      {
        label:
          role === 'DRIVER'
            ? 'Deslizar para marcar: Comisión entregada'
            : 'Deslizar para marcar: Comisión recibida',
        color: VERDE_ACCION,
      },
    ];
  }
  if (step === 'PAYMENT_RECEIVED') {
    return [
      {
        label:
          role === 'DRIVER'
            ? 'Deslizar para marcar: Pago recibido'
            : 'Deslizar para marcar: Abonado / Finalizado',
        color: VERDE_ACCION,
      },
    ];
  }
  return [
    {
      label: 'Servicio cerrado',
      color: VERDE_ACCION,
    },
  ];
}

export function SwipeStatusButton(props: Props) {
  const generic = isGeneric(props);
  const role = generic ? undefined : props.role;
  const step = generic ? undefined : props.step;
  const progressIndex = generic ? undefined : (props.progressIndex ?? 0);

  const states = generic ? props.states : buildRoleStates(role!, step!);
  const currentIndex = generic ? props.currentIndex : (progressIndex ?? 0);
  const disabledByRole = generic ? false : role === 'PROVIDER' && step === 'IN_PROGRESS';
  const disabled = Boolean(props.disabled) || disabledByRole;

  // El ancho real de la barra se mide en pantalla: antes se usaba el ancho de la
  // ventana y el recorrido quedaba descuadrado (y con umbral de 0.7 era muy
  // difícil que el deslizamiento contara).
  const [trackWidth, setTrackWidth] = useState(0);
  const maxTranslate = Math.max(trackWidth - THUMB_SIZE - 8, 1);

  const translateX = useRef(new Animated.Value(0)).current;
  const current = states[currentIndex] || states[states.length - 1];
  const isFinal = disabled || (generic ? currentIndex >= states.length - 1 : step === 'FINISHED');

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
  const maxRef = useRef(maxTranslate);
  useEffect(() => {
    maxRef.current = maxTranslate;
  }, [maxTranslate]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !propsRef.current.disabled,
      onMoveShouldSetPanResponder: () => !propsRef.current.disabled,
      // El deslizamiento no se cede a la lista ni al scroll mientras se arrastra.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderMove: (_evt, gestureState: PanResponderGestureState) => {
        // Sin offsets: el pulgar siempre parte de 0 y vuelve a 0 al soltar.
        const nuevo = Math.max(0, Math.min(gestureState.dx, maxRef.current));
        translateX.setValue(nuevo);
      },
      onPanResponderRelease: (_evt, gestureState: PanResponderGestureState) => {
        const recorrido = Math.max(0, Math.min(gestureState.dx, maxRef.current));
        const progress = recorrido / maxRef.current;
        if (progress >= UMBRAL) {
          const { generic: isGen, onAdvance, currentIndex: idx } = propsRef.current;
          if (isGen) {
            (onAdvance as (nextIndex: number) => void)(idx + 1);
          } else {
            (onAdvance as () => void)();
          }
        }
        resetThumb();
      },
      onPanResponderTerminate: () => {
        resetThumb();
      },
    })
  ).current;

  const progressWidth = translateX.interpolate({
    inputRange: [0, maxTranslate],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  const onLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (width && Math.abs(width - trackWidth) > 1) setTrackWidth(width);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.track, { backgroundColor: current.color }]} onLayout={onLayout}>
        <Animated.View
          style={[
            styles.fill,
            { backgroundColor: current.color, width: progressWidth, opacity: isFinal ? 1 : 0.85 },
          ]}
        />
        <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit>
          {current.label}
        </Text>
        {!isFinal && (
          <Animated.View
            style={[styles.thumb, { transform: [{ translateX }] }]}
            {...panResponder.panHandlers}
          >
            <Text style={styles.thumbIcon}>→</Text>
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
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  thumb: {
    position: 'absolute',
    left: 4,
    top: 4,
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
    fontSize: 18,
    fontWeight: 'bold',
  },
});
