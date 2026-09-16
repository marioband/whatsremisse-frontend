import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { estadoDeServicio, VistaServicio } from '../lib/estadoServicio';
import { ServiceAlert } from '../types';

interface Props {
  service: ServiceAlert;
  /** Postulaciones pendientes del servicio (para la señal "(x) Postulantes"). */
  postulantes?: number;
  /**
   * Lado desde el que se mira la tarjeta: el conductor nunca ve la jerga del
   * proveedor ("Buscando conductores", "Servicio vencido"), ve lo suyo
   * ("Disponible", "No disponible").
   */
  vista?: VistaServicio;
  /** Línea extra bajo el estado (p. ej. el tiempo de gracia de un vencido). */
  detalle?: string;
  /** Radio de las esquinas inferiores, para encajar con la tarjeta que hay encima. */
  radius?: number;
}

/**
 * Franja de estado al pie de la tarjeta. El texto y el color salen de
 * `estadoDeServicio`, que es la única fuente de verdad del proceso.
 */
export function EstadoServicioBar({
  service,
  postulantes = 0,
  vista = 'PROVEEDOR',
  detalle,
  radius = 12,
}: Props) {
  const { etiqueta, color } = estadoDeServicio(service, postulantes, vista);

  // Sin nada que comunicar no se pinta franja: la tarjeta del conductor ya muestra
  // el servicio, la hora, el recorrido y la tarifa.
  if (!etiqueta) return null;

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: color,
          borderBottomLeftRadius: radius,
          borderBottomRightRadius: radius,
        },
      ]}
    >
      <Text style={styles.texto}>{etiqueta}</Text>
      {!!detalle && <Text style={styles.detalle}>{detalle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texto: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  detalle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
});
