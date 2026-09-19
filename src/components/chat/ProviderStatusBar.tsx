import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { VERDE_ACCION } from '../../lib/colors';
import { ServiceAlert } from '../../types';

interface ProviderStatusBarProps {
  service: ServiceAlert;
}

/**
 * Franja verde del proveedor dentro del chat: el hito del viaje que reporta el
 * conductor. Los textos van con mayúscula inicial (el usuario lo pidió: antes decía
 * "en camino" en minúscula).
 *
 * La barra de **Aceptar / Rechazar** del postulante va aparte (`EvaluationBar`) y aquí no
 * se pinta: las dos son la zona de arriba del chat y nunca coinciden — esta solo sale con
 * el servicio ya ASIGNADO y en curso, y aquella solo con una postulación PENDIENTE. El
 * 17-09-2026 la decisión se tomaba únicamente desde la tarjeta; el usuario la devolvió al
 * chat el 19-09-2026 (ver `EvaluationBar`).
 */
export function ProviderStatusBar({ service }: ProviderStatusBarProps) {
  const step = service.driver_progress_step ?? 0;
  let text = 'En camino';
  if (step === 1) text = 'Ubicado';
  else if (step === 2) text = 'En proceso';
  else if (step >= 3) text = 'Finalizado';

  return (
    <View style={styles.container}>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 50,
    backgroundColor: VERDE_ACCION,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
