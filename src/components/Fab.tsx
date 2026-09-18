import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';

import { OSCURO } from '../lib/colors';

/**
 * Capa del botón flotante. Tiene que quedar por ENCIMA de las tarjetas: en
 * react-native-web `elevation` no hace nada y sin `zIndex` la tarjeta que asoma por
 * debajo (ServiceCard usa zIndex 1) se pintaba encima, así que el "+" desaparecía
 * al llegar al final de la lista.
 */
export const Z_FAB = 50;

interface Props {
  onPress: () => void;
  /** Color del círculo: azul para las acciones neutras, oscuro por defecto. */
  color?: string;
  /** Para lectores de pantalla (el "+" solo no dice nada). */
  etiqueta: string;
}

/**
 * Botón flotante (+) de las pantallas de lista.
 *
 * Regla fijada con el usuario: **siempre abajo a la derecha y siempre a la vista**,
 * sin importar cuánto se desplace la lista.
 */
export function Fab({ onPress, color = OSCURO, etiqueta }: Props) {
  return (
    <TouchableOpacity
      style={[styles.fab, { backgroundColor: color }]}
      onPress={onPress}
      accessibilityLabel={etiqueta}
      activeOpacity={0.85}
    >
      {/* El "+" se dibuja con DOS BARRAS en vez del glifo `+`: el glifo no queda
          centrado en su caja (medido: su cruce caía 2 px arriba y 1,5 px a la izquierda
          del centro del círculo, y el usuario lo notó). Con las barras el cruce cae
          exacto en el centro del círculo y no depende de la tipografía. */}
      <View style={styles.cruz}>
        <View style={styles.barraHorizontal} />
        <View style={styles.barraVertical} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: Z_FAB,
    // Nativo: sombra del botón flotante.
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  /* La cruz: un cuadrado centrado con las dos barras absolutas dentro. */
  cruz: {
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  barraHorizontal: {
    position: 'absolute',
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  barraVertical: {
    position: 'absolute',
    width: 3,
    height: 18,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
});
