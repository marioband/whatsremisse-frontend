import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { estadoDeServicio, MiPostulacionEnLaTarjeta, VistaServicio } from '../lib/estadoServicio';
import { ServiceAlert } from '../types';

interface Props {
  service: ServiceAlert;
  /** Postulaciones pendientes del servicio (para la señal "(x) Postulantes"). */
  postulantes?: number;
  /**
   * Lado desde el que se mira la tarjeta: el conductor nunca ve la jerga del
   * proveedor ("Buscando conductores", "Servicio vencido"), ve lo suyo
   * (su puesto de postulante, "Servicio aceptado, toca para iniciar",
   * "Servicio rechazado o cubierto por otro conductor").
   */
  vista?: VistaServicio;
  /** Solo para la vista del conductor: su propia postulación en este servicio. */
  miPostulacion?: MiPostulacionEnLaTarjeta;
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
  miPostulacion,
  detalle,
  radius = 12,
}: Props) {
  const { etiqueta, color, porCerrar, aviso } = estadoDeServicio(
    service,
    postulantes,
    vista,
    miPostulacion
  );

  /**
   * La cuenta atrás tiene que ser REAL: mientras a la alerta le queden menos de 5
   * minutos se vuelve a calcular cada segundo (el texto sale de `estadoDeServicio`,
   * que mira el reloj en cada render).
   */
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!porCerrar) return;
    const temporizador = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(temporizador);
  }, [porCerrar]);

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
      {!!aviso && <Text style={styles.detalle}>{aviso}</Text>}
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
