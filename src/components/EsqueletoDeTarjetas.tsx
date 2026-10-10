import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { BORDE_SUAVE, FONDO_TARJETA, RADIOS } from '../lib/diseno';
import { useMovimientoReducido } from '../lib/movimiento';

/**
 * Esqueleto de las tarjetas del inicio (10-10-2026).
 *
 * POR QUÉ EXISTE: en un arranque en frío (sin caché en el teléfono) la lista tardaba en
 * llegar y la pantalla decía «No hay servicios disponibles» mientras en realidad estaba
 * cargando (medido con red lenta: más de 20 s de mensaje falso). Un esqueleto con la FORMA
 * de la tarjeta real (círculo del avatar, líneas de datos y franja al pie) cuenta lo que
 * está pasando sin mentir, y desaparece en cuanto hay datos.
 *
 * Reglas:
 *   - Solo se pinta mientras la primera carga está en curso y no hay NADA que mostrar
 *     (la bandera `cargandoInicial` del store); con caché, las tarjetas salen al instante.
 *   - El latido es sobrio (opacidad, ~850 ms por lado) y se apaga con «Reducir movimiento»:
 *     en ese caso queda una forma quieta, igual de clara.
 *   - Es inerte: no recibe toques, así que no compite con nada de lo que hace el usuario.
 */
export function EsqueletoDeTarjetas({ cantidad = 2 }: { cantidad?: number }) {
  const reducido = useMovimientoReducido();
  const pulso = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reducido) {
      pulso.setValue(1);
      return;
    }
    const ciclo = Animated.loop(
      Animated.sequence([
        Animated.timing(pulso, { toValue: 0.55, duration: 850, useNativeDriver: true }),
        Animated.timing(pulso, { toValue: 1, duration: 850, useNativeDriver: true }),
      ])
    );
    ciclo.start();
    return () => ciclo.stop();
  }, [reducido, pulso]);

  return (
    <View
      style={styles.lista}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Cargando servicios"
    >
      {Array.from({ length: cantidad }).map((_, i) => (
        <Animated.View key={i} style={[styles.tarjeta, { opacity: pulso }]}>
          <View style={styles.cuerpo}>
            <View style={styles.avatar} />
            <View style={styles.columna}>
              <View style={[styles.linea, styles.lineaAncha]} />
              <View style={[styles.linea, styles.lineaMedia]} />
              <View style={[styles.linea, styles.lineaCorta]} />
              <View style={[styles.linea, styles.lineaAncha]} />
            </View>
          </View>
          <View style={styles.franja} />
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  /** Sin relleno propio: la lista ya trae el suyo; así el esqueleto cae donde caerán las tarjetas. */
  lista: {},
  /** Mismas medidas que la tarjeta real: margen 12, radio 12, ancho completo. */
  tarjeta: {
    backgroundColor: FONDO_TARJETA,
    borderRadius: RADIOS.md,
    marginHorizontal: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cuerpo: {
    flexDirection: 'row',
    padding: 14,
    minHeight: 146,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: BORDE_SUAVE,
    marginRight: 12,
  },
  columna: {
    flex: 1,
    gap: 12,
    paddingTop: 2,
  },
  linea: {
    height: 12,
    borderRadius: 6,
    backgroundColor: BORDE_SUAVE,
  },
  lineaAncha: { width: '62%' },
  lineaMedia: { width: '84%' },
  lineaCorta: { width: '46%' },
  /** La franja del pie de la tarjeta (en la tarjeta real lleva el estado). */
  franja: {
    height: 30,
    backgroundColor: BORDE_SUAVE,
  },
});
