import React from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';

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
      <Text style={styles.icono}>+</Text>
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
  icono: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
    lineHeight: 30,
  },
});
