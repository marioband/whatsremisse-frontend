import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import {
  cortarPedidoDeUbicacion,
  pedidoDeUbicacionDelServicio,
  responderPedidoDeUbicacion,
} from '../../lib/database';
import { AZUL, RADIOS, ROJO_ACCION, TEXTO_SUAVE } from '../../lib/diseno';
import { textoDeErrorParaElUsuario } from '../../lib/errors';
import { ServiceAlert } from '../../types';

/** Cada cuánto se relee el estado mientras la tarjeta está a la vista. */
const CADA_MS = 8000;

/**
 * «Compartir ubicación» del CONDUCTOR (0053, 10-10-2026).
 *
 * Cuando el proveedor pide verlo en vivo, al conductor le aparece este bloque en la tarjeta del
 * chat (donde su botón de navegación), con la forma que él propuso: un botón azul como
 * «Compartir viaje», pero llamado «Compartir ubicación». Es el CONSENTIMIENTO: sin aceptar, el
 * proveedor no ve nada. Después puede «Dejar de compartir» cuando quiera (y el proveedor lo ve).
 */
export function PideTuUbicacion({ service }: { service: ServiceAlert }) {
  const [pedido, setPedido] = useState<{ id: string; estado: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const montado = useRef(true);

  const refrescar = useCallback(async () => {
    try {
      const actual = await pedidoDeUbicacionDelServicio(service.id);
      if (montado.current) {
        setPedido(actual ? { id: actual.id, estado: actual.estado } : null);
      }
    } catch {
      // Es una tarjeta: si la base no responde, simplemente no se enseña el bloque.
    }
  }, [service.id]);

  useEffect(() => {
    montado.current = true;
    void refrescar();
    const reloj = setInterval(() => void refrescar(), CADA_MS);
    return () => {
      montado.current = false;
      clearInterval(reloj);
    };
  }, [refrescar]);

  const responder = async (aceptar: boolean) => {
    if (!pedido || ocupado) return;
    setOcupado(true);
    try {
      const estado = await responderPedidoDeUbicacion(pedido.id, aceptar);
      setPedido((prev) =>
        prev ? { ...prev, estado: estado || (aceptar ? 'ACEPTADO' : 'RECHAZADO') } : prev
      );
    } catch (err) {
      Alert.alert('No se pudo responder', textoDeErrorParaElUsuario(err));
    } finally {
      setOcupado(false);
    }
  };

  const cortar = async () => {
    if (!pedido || ocupado) return;
    setOcupado(true);
    try {
      await cortarPedidoDeUbicacion(pedido.id);
      setPedido((prev) => (prev ? { ...prev, estado: 'CORTADO' } : prev));
    } catch (err) {
      Alert.alert('No se pudo dejar de compartir', textoDeErrorParaElUsuario(err));
    } finally {
      setOcupado(false);
    }
  };

  const estado = pedido?.estado ?? null;

  if (estado === 'PEDIDO') {
    return (
      <View style={styles.caja}>
        <Text style={styles.pregunta}>
          El proveedor quiere ver tu ubicación en vivo mientras dure el viaje.
        </Text>
        <TouchableOpacity
          style={[styles.botonAzul, ocupado && styles.apagado]}
          onPress={() => responder(true)}
          disabled={ocupado}
          accessibilityRole="button"
        >
          <Text style={styles.textoAzul}>Compartir ubicación</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => responder(false)}
          disabled={ocupado}
          /* El texto mide ~34 de alto: con este margen el toque llega a 44. */
          hitSlop={{ top: 6, bottom: 6 }}
        >
          <Text style={styles.ahoraNo}>Ahora no</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (estado === 'ACEPTADO') {
    return (
      <View style={styles.caja}>
        <Text style={styles.pregunta}>
          Estás compartiendo tu ubicación con el proveedor (ve tu unidad en vivo).
        </Text>
        <TouchableOpacity
          onPress={cortar}
          disabled={ocupado}
          hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
        >
          <Text style={styles.dejarDeCompartir}>Dejar de compartir</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  caja: {
    marginHorizontal: 12,
    marginBottom: 10,
    alignItems: 'center',
  },
  pregunta: {
    color: TEXTO_SUAVE,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
    // OJO: en React Native `lineHeight` es PÍXELES, no multiplicador: con `1.35` las dos
    // líneas quedan a 1.35 px y se pintan encima (el texto «pisado» que reportó el usuario el
    // 10-10-2026). Se usa el valor absoluto de la casa, como en el resto de la app.
    lineHeight: 18,
  },
  botonAzul: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AZUL,
    borderRadius: RADIOS.md,
    paddingVertical: 14,
  },
  apagado: { opacity: 0.6 },
  textoAzul: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  ahoraNo: {
    /* 10-10-2026: era #6B7280 — 4,3:1 sobre el gris de la tarjeta, debajo de 4,5:1. #5B6472 da 5,3:1. */
    color: '#5B6472',
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  dejarDeCompartir: {
    /** 10-10-2026: el rojo de la casa (antes #B00020, de la paleta de Material) y toque
     *  completo: 38 px reales (11+16+11) + hitSlop de 8 arriba y abajo = 54 efectivos —
     *  es una acción destructiva y no puede quedar escasa de dedo. */
    color: ROJO_ACCION,
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
});
