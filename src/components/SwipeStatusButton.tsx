import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  Animated,
  Dimensions,
  PanResponderGestureState,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TRACK_HEIGHT = 50;
const THUMB_SIZE = 42;

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
}

type Props = GenericProps | RoleProps;

const GREEN = '#4CD964';

function isGeneric(props: Props): props is GenericProps {
  return 'states' in props;
}

function buildRoleStates(
  role: 'DRIVER' | 'PROVIDER',
  step: 'IN_PROGRESS' | 'COMMISSION_PAID' | 'PAYMENT_RECEIVED' | 'FINISHED'
): SwipeState[] {
  if (step === 'IN_PROGRESS') {
    const subLabels = ['ubicado', 'inicio', 'finalizado'];
    return subLabels.map((sub) => ({
      label: sub,
      color: GREEN,
    }));
  }
  if (step === 'COMMISSION_PAID') {
    return [
      {
        label:
          role === 'DRIVER'
            ? 'Deslizar para marcar: Comisi\u00f3n entregada'
            : 'Deslizar para marcar: Comisi\u00f3n recibida',
        color: GREEN,
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
        color: GREEN,
      },
    ];
  }
  return [
    {
      label: 'Servicio cerrado',
      color: GREEN,
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
  const disabled = generic ? props.disabled : role === 'PROVIDER' && step === 'IN_PROGRESS';

  const trackWidth = SCREEN_WIDTH;
  const maxTranslate = trackWidth - THUMB_SIZE - 8;
  const translateX = useRef(new Animated.Value(0)).current;
  const current = states[currentIndex] || states[states.length - 1];
  const isFinal = disabled || (generic ? currentIndex >= states.length - 1 : step === 'FINISHED');

  const resetThumb = () => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: false,
      friction: 7,
    }).start();
  };

  useEffect(() => {
    resetThumb();
  }, [currentIndex, states.length]);

  // Refs para evitar que PanResponder capture callbacks/valores obsoletos
  const propsRef = useRef({ generic, onAdvance: props.onAdvance, currentIndex, isFinal });
  useEffect(() => {
    propsRef.current = { generic, onAdvance: props.onAdvance, currentIndex, isFinal };
  }, [generic, props.onAdvance, currentIndex, isFinal]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !propsRef.current.isFinal,
      onMoveShouldSetPanResponder: () => !propsRef.current.isFinal,
      onPanResponderGrant: () => {
        // Mueve el valor actual al offset y resetea el valor a 0 usando la API pública de Animated
        translateX.extractOffset();
      },
      onPanResponderMove: (_evt, gestureState: PanResponderGestureState) => {
        const newX = Math.max(0, Math.min(gestureState.dx, maxTranslate));
        translateX.setValue(newX);
      },
      onPanResponderRelease: (_evt, gestureState: PanResponderGestureState) => {
        translateX.flattenOffset();
        const progress = Math.max(0, Math.min(gestureState.dx, maxTranslate)) / maxTranslate;
        if (progress > 0.7) {
          const { generic: isGen, onAdvance, currentIndex: idx } = propsRef.current;
          if (isGen) {
            (onAdvance as (nextIndex: number) => void)(idx + 1);
          } else {
            (onAdvance as () => void)();
          }
        }
        resetThumb();
      },
    })
  ).current;

  const progressWidth = translateX.interpolate({
    inputRange: [0, maxTranslate],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      <View style={[styles.track, { backgroundColor: current.color }]}>
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
            <Text style={styles.thumbIcon}>\u2192</Text>
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
    borderRadius: 0,
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
