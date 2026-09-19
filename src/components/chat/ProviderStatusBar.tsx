import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { VERDE_ACCION } from '../../lib/colors';
import { paradaDelPaso, paradasDelServicio, totalDePasos } from '../../lib/paradasDelServicio';
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
 *
 * Cuando el servicio tiene varias paradas, el conductor reporta parada por parada y aquí se ve
 * cuál y por cuántas va («Destino 2 de 3») en vez de «En proceso» (pedido del usuario,
 * 19-09-2026).
 */
export function ProviderStatusBar({ service }: ProviderStatusBarProps) {
  const step = service.driver_progress_step ?? 0;
  const paradas = paradasDelServicio(service);
  let text = 'En camino';

  if (paradas.length > 1) {
    const total = totalDePasos(service);
    if (step <= 0) text = 'En camino';
    else if (step >= total) text = 'Finalizado';
    else {
      const destino = paradaDelPaso(service, step);
      text = `Destino ${step} de ${paradas.length}${destino ? ` · ${destino}` : ''}`;
    }
  } else if (step === 1) text = 'Ubicado';
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
