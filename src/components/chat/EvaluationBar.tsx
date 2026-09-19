import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

import { ROJO_ACCION, VERDE_ACCION } from '../../lib/colors';

interface EvaluationBarProps {
  onAccept: () => void;
  onReject: () => void;
}

/**
 * Los dos botones para decidir sobre un postulante DENTRO del chat del proveedor.
 *
 * El usuario lo pidió el 19-09-2026: «cuando el proveedor ve la tarjeta del postulante tiene
 * 3 botones; cuando elige conversar se abre el chat y en este chat siempre han habido 2
 * botones, rechazar y aceptar, actualmente esos botones no están». Estuvieron hasta el
 * 17-09 y se quitaron porque **aparecían un segundo al abrir el chat** (la asignación
 * todavía no había llegado al estado local) y se iban solos.
 *
 * El componente es el mismo de entonces; lo que cambió es **cuándo se monta**: ahora solo
 * cuando hay una postulación PENDIENTE de ese conductor y los datos ya cargaron
 * (`decisionPendiente` en `ChatScreen`). Así no puede parpadear: si se pinta, hay algo que
 * decidir; si no, no se pinta.
 */
export function EvaluationBar({ onAccept, onReject }: EvaluationBarProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, styles.acceptBtn]}
        onPress={onAccept}
        accessibilityRole="button"
        accessibilityLabel="Aceptar postulante"
      >
        <Text style={styles.buttonText}>Aceptar</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, styles.rejectBtn]}
        onPress={onReject}
        accessibilityRole="button"
        accessibilityLabel="Rechazar postulante"
      >
        <Text style={styles.buttonText}>Rechazar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#F2F2F2',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 20,
    alignItems: 'center',
  },
  acceptBtn: { backgroundColor: VERDE_ACCION, marginRight: 8 },
  rejectBtn: { backgroundColor: ROJO_ACCION, marginLeft: 8 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});
