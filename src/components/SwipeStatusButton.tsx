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
  Platform,
} from 'react-native';

import {
  desplazamientoMaximo,
  fotogramaDeBarra,
  fraccionDelRelleno,
  llegoAlUmbral,
  puntoDeAgarre,
  VUELO_MS,
} from '../lib/barraDeProceso';
import { VERDE_ACCION, VERDE_DESLIZABLE } from '../lib/colors';

const TRACK_HEIGHT = 54;
const THUMB_SIZE = 44;
/** Separación del pulgar con los bordes de la barra (arriba, abajo, izquierda y derecha). */
const MARGEN = 5;
/** Cuadrado redondeado, no círculo (modelo del usuario). */
const THUMB_RADIO = 8;
/** Esquinas de la barra (el modelo las tiene redondeadas). */
const TRACK_RADIO = 8;
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
 * Barra de proceso del viaje (modelo del usuario, imágenes
 * `dashboard_20260916_145538` y `dashboard_20260917_112743`): fondo verde oscuro con
 * la flecha, pulgar cuadrado redondeado y relleno en verde claro, texto centrado con
 * el hito que se reporta.
 *
 * Reglas de forma que fijó el usuario (imagen de referencia):
 *   * el pulgar conserva su alto al deslizarse: el relleno lleva los MISMOS márgenes
 *     que el pulgar (antes ocupaba todo el alto y el botón parecía perder sus
 *     dimensiones arriba y abajo);
 *   * el pulgar guarda el mismo margen al empezar y al terminar el recorrido;
 *   * el deslizamiento es ÁGIL: el dedo no tiene zona muerta (se conserva el punto de
 *     agarre) y el arrastre NO re-renderiza: el movimiento va por `Animated`, y solo
 *     se cambia el texto cuando se cruza el umbral.
 *
 * El gesto se atiende en TODA la barra (no solo en el pulgar) y el pulgar sigue al
 * dedo usando la posición absoluta del toque contra el borde medido de la barra. Al
 * soltar pasado el umbral, el pulgar viaja al extremo (fotograma "completado": barra
 * llena y sin texto) y recién entonces se reporta el hito.
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
  /** Desplazamiento actual del pulgar (para saber dónde cayó el dedo). */
  const desplazamientoRef = useRef(0);
  /** Punto de agarre del dedo dentro del pulgar. */
  const agarreRef = useRef(THUMB_SIZE / 2);
  /**
   * Arranque del gesto, para seguir al dedo por DESPLAZAMIENTO (no por posición
   * absoluta). Es lo que hace que el pulgar siga al dedo 1 a 1 aunque no se haya podido
   * medir el borde de la barra: sin esto, `locationX` viene referido al elemento que hay
   * debajo del dedo (el pulgar, el relleno o el rótulo) y cada tramo arrastraba un salto
   * de 5 px: el "no es fluido, muestra retrasos" que reportó el usuario.
   */
  const gestoRef = useRef({ x0: 0, absolutaInicial: 0 });
  /**
   * Con qué referencias se está midiendo ESTE gesto. Se decide una sola vez, al
   * empezar: mezclar en el mismo gesto la posición absoluta (que necesita el borde de la
   * barra ya medido) con la relativa al toque metía un salto de 5 px en cuanto llegaba
   * la medición (el pulgar se adelantaba). Con la decisión tomada de una vez, el pulgar
   * sigue al dedo 1 a 1 de principio a fin.
   */
  const usarBordeRef = useRef(false);
  /** Último valor de "listo" sin pasar por React: el arrastre no re-renderiza. */
  const listoRef = useRef(false);

  const anchoDeBarra = () => anchoRef.current || trackWidth || 0;
  const recorridoMaximo = () => desplazamientoMaximo(anchoDeBarra(), THUMB_SIZE, MARGEN);

  const fotograma = fotogramaDeBarra({ progressIndex, arrastrando: dragging, listo, volando });

  const resetThumb = () => {
    desplazamientoRef.current = 0;
    translateX.setValue(0);
    // En reposo el relleno queda exactamente debajo del pulgar (mismo alto y ancho).
    // Sin ancho medido todavía no se pinta nada (un ancho inventado daría una barra
    // llena de un tirón).
    const ancho = anchoDeBarra();
    relleno.setValue(ancho > 0 ? fraccionDelRelleno(0, THUMB_SIZE, ancho) : 0);
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

  /**
   * Posición del dedo dentro de la barra (0 = borde izquierdo).
   *
   * Con el borde de la barra medido se usa la posición absoluta. Sin medición (el
   * `measureInWindow` de react-native-web puede no haber respondido todavía) se sigue al
   * dedo por desplazamiento desde el punto donde empezó el gesto, que da el mismo
   * seguimiento 1 a 1 sin depender de coordenadas de ventana.
   */
  const posicionEnBarra = (gesture: PanResponderGestureState, locationX: number) => {
    const ancho = anchoDeBarra();
    if (!ancho) return 0;
    if (usarBordeRef.current) return clamp(gesture.moveX - pageXRef.current, 0, ancho);
    const delta = gesture.moveX - gestoRef.current.x0;
    return clamp(gestoRef.current.absolutaInicial + delta, 0, ancho);
  };

  /**
   * Mueve el pulgar y el relleno. No usa `setState` más que al cruzar el umbral: el
   * movimiento va por `Animated` para que el pulgar siga al dedo sin retrasos.
   */
  const pintarArrastre = (dentro: number) => {
    const ancho = anchoDeBarra() || 1;
    const desplazamiento = clamp(dentro - agarreRef.current, 0, recorridoMaximo());
    desplazamientoRef.current = desplazamiento;
    translateX.setValue(desplazamiento);
    // El relleno llega hasta el borde derecho del pulgar y conserva sus mismos márgenes.
    relleno.setValue(fraccionDelRelleno(desplazamiento, THUMB_SIZE, ancho));
    const alcanzado = llegoAlUmbral(dentro, ancho);
    if (alcanzado !== listoRef.current) {
      listoRef.current = alcanzado;
      setListo(alcanzado);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      // Mientras el pulgar viaja al extremo no se atiende otro gesto.
      onStartShouldSetPanResponder: () => !estadoRef.current.volando,
      onMoveShouldSetPanResponder: () => !estadoRef.current.volando,
      // El gesto no se cede a la lista ni al scroll mientras se arrastra.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (evt, gesture: PanResponderGestureState) => {
        // El borde de la barra se mide otra vez en cada gesto: si la pantalla cambió de
        // tamaño, o la medición inicial no llegó, aquí se recupera.
        medir();
        // Se decide UNA sola vez con qué referencias se mide este gesto (ver
        // `usarBordeRef`): mezclarlas metía un salto de 5 px a mitad de arrastre.
        usarBordeRef.current = pageXRef.current > 0;
        if (usarBordeRef.current) {
          // Con el borde medido, el dedo y el pulgar comparten el sistema de la barra:
          // se conserva el punto de agarre y el dedo que cae fuera del pulgar lo trae.
          const dentro = clamp(gesture.x0 - pageXRef.current, 0, anchoDeBarra());
          agarreRef.current = puntoDeAgarre(dentro, desplazamientoRef.current, THUMB_SIZE, MARGEN);
        } else {
          // Sin el borde medido no se puede saber en qué punto de la barra cayó el dedo
          // (`locationX` de react-native-web viene referido al elemento que hay debajo):
          // se sigue al dedo por DESPLAZAMIENTO desde donde estaba el pulgar, que da el
          // mismo seguimiento 1 a 1 desde el primer píxel, sin saltos ni zona muerta.
          agarreRef.current = THUMB_SIZE / 2;
          gestoRef.current = {
            x0: gesture.x0,
            // El "dedo equivalente" arranca en el centro del pulgar: dentro y el
            // desplazamiento quedan en el mismo sistema y el pulgar no salta al pulsar.
            absolutaInicial: desplazamientoRef.current + THUMB_SIZE / 2,
          };
        }
        listoRef.current = false;
        setDragging(true);
        setListo(false);
        pintarArrastre(posicionEnBarra(gesture, evt.nativeEvent.locationX));
      },
      onPanResponderMove: (evt, gesture: PanResponderGestureState) => {
        pintarArrastre(posicionEnBarra(gesture, evt.nativeEvent.locationX));
      },
      onPanResponderRelease: (evt, gesture: PanResponderGestureState) => {
        const ancho = anchoDeBarra() || 1;
        const dentro = posicionEnBarra(gesture, evt.nativeEvent.locationX);

        setDragging(false);
        setListo(false);
        listoRef.current = false;

        if (!llegoAlUmbral(dentro, ancho)) {
          // No llegó: el pulgar vuelve solo al inicio.
          desplazamientoRef.current = 0;
          Animated.timing(translateX, {
            toValue: 0,
            duration: 160,
            useNativeDriver: false,
          }).start(() => relleno.setValue(fraccionDelRelleno(0, THUMB_SIZE, ancho)));
          return;
        }

        // Fotograma "completado" del modelo: barra llena, flecha al extremo y sin
        // texto. Cuando termina el viaje del pulgar recién se reporta el hito, así
        // el padre cambia el texto al hito siguiente (o entra la zona de pago).
        const destino = recorridoMaximo();
        setVolando(true);
        setListo(false);
        desplazamientoRef.current = destino;
        Animated.parallel([
          Animated.timing(translateX, {
            toValue: destino,
            duration: VUELO_MS,
            useNativeDriver: false,
          }),
          Animated.timing(relleno, {
            toValue: fraccionDelRelleno(destino, THUMB_SIZE, ancho),
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
        listoRef.current = false;
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
    // El relleno se mide en fracción del ancho: si la barra cambia de tamaño hay que
    // recalcularlo (nunca en medio de un arrastre, que lo gobierna el dedo).
    if (!dragging && !volando) {
      const ancho = anchoRef.current;
      relleno.setValue(
        ancho > 0 ? fraccionDelRelleno(desplazamientoRef.current, THUMB_SIZE, ancho) : 0
      );
    }
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
    borderRadius: TRACK_RADIO,
    // Fondo de la barra (modelo: #2E9E5B).
    backgroundColor: VERDE_ACCION,
    // Web: sin esto el navegador decide en cada touchmove si desplaza la página, y el
    // pulgar va con retraso (el "no es fluido" que reportó el usuario). El gesto es
    // nuestro: la barra vive fuera de la lista, así que no roba ningún scroll.
    ...Platform.select({ web: { touchAction: 'none', userSelect: 'none' } as object }),
  },
  fill: {
    position: 'absolute',
    // Los MISMOS márgenes que el pulgar: el relleno y el pulgar se leen como una sola
    // pieza, así el botón no pierde su alto al deslizarse.
    left: MARGEN,
    top: MARGEN,
    bottom: MARGEN,
    borderRadius: THUMB_RADIO,
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
