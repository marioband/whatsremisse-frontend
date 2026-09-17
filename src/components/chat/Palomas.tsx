import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet } from 'react-native';

import { EstadoDePalomas } from '../../lib/palomas';

/**
 * Palomitas del mensaje (migración 0020), dentro de la burbuja y al lado de la
 * hora:
 *   * relojito: el mensaje todavía no está guardado en la base;
 *   * palomita tenue: se envió;
 *   * doble palomita blanca: lo leyeron TODOS los demás participantes.
 *
 * Van sobre la burbuja azul (texto blanco), así que los colores son los de esa
 * paleta. Los iconos son de `@expo/vector-icons` (regla del proyecto: nunca
 * emojis).
 */
const TENUE = 'rgba(255,255,255,0.55)';
const LEIDO = '#FFFFFF';

export function Palomas({ estado }: { estado: EstadoDePalomas | null }) {
  if (!estado) return null;

  if (estado === 'ENVIANDO') {
    return (
      <MaterialCommunityIcons
        name="clock-outline"
        size={12}
        color={TENUE}
        style={styles.icono}
        accessibilityLabel="Enviando"
      />
    );
  }

  if (estado === 'LEIDO') {
    return (
      <MaterialCommunityIcons
        name="check-all"
        size={14}
        color={LEIDO}
        style={styles.icono}
        accessibilityLabel="Leído por todos"
      />
    );
  }

  return (
    <MaterialCommunityIcons
      name="check"
      size={14}
      color={TENUE}
      style={styles.icono}
      accessibilityLabel="Enviado"
    />
  );
}

const styles = StyleSheet.create({
  icono: { marginLeft: 3 },
});
