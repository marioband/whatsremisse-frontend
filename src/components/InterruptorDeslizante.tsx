import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';

import { coloresDelInterruptor } from '../lib/navegacion';

const PISTA_ANCHO = 46;
const PISTA_ALTO = 26;
const CIRCULO = 20;
const MARGEN = 3;

/**
 * Interruptor del selector (Cuenta → Navegación).
 *
 * Es propio y no el `Switch` de React Native a propósito (18-09-2026): en web el `Switch`
 * aplicaba el `trackColor` pero el **círculo** lo dibujaba el navegador, así que salía
 * verde en vez del color pedido. El usuario fijó los colores: al activarlo, la barra en
 * `#B8BED8` y el círculo en el azul institucional (`#3F51B5`); apagado, barra gris y
 * círculo blanco. Los colores viven en `lib/navegacion.ts` (`coloresDelInterruptor`), que
 * es lógica pura y se prueba con node.
 */
export function InterruptorDeslizante({
  encendido,
  onCambiar,
  etiqueta,
}: {
  encendido: boolean;
  onCambiar: (encendido: boolean) => void;
  etiqueta: string;
}) {
  const colores = coloresDelInterruptor(encendido);

  return (
    <TouchableOpacity
      style={[styles.pista, { backgroundColor: colores.pista }]}
      activeOpacity={0.85}
      onPress={() => onCambiar(!encendido)}
      accessibilityRole="switch"
      accessibilityState={{ checked: encendido }}
      accessibilityLabel={etiqueta}
    >
      <View
        style={[
          styles.circulo,
          { backgroundColor: colores.circulo },
          encendido ? styles.circuloEncendido : styles.circuloApagado,
        ]}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pista: {
    width: PISTA_ANCHO,
    height: PISTA_ALTO,
    borderRadius: PISTA_ALTO / 2,
    padding: MARGEN,
    justifyContent: 'center',
  },
  circulo: {
    width: CIRCULO,
    height: CIRCULO,
    borderRadius: CIRCULO / 2,
  },
  /** Encendido: el círculo va al extremo derecho (el carril que queda libre). */
  circuloEncendido: {
    alignSelf: 'flex-end',
  },
  circuloApagado: {
    alignSelf: 'flex-start',
  },
});
