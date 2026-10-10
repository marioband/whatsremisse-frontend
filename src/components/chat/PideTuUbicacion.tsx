import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { AZUL } from '../../lib/colors';
import {
  cortarPedidoDeUbicacion,
  pedidoDeUbicacionDelServicio,
  responderPedidoDeUbicacion,
} from '../../lib/database';
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
        <TouchableOpacity onPress={() => responder(false)} disabled={ocupado}>
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
        <TouchableOpacity onPress={cortar} disabled={ocupado}>
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
    color: '#555555',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 1.35,
  },
  botonAzul: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AZUL,
    borderRadius: 12,
    paddingVertical: 14,
  },
  apagado: { opacity: 0.6 },
  textoAzul: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  ahoraNo: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  dejarDeCompartir: {
    color: '#B00020',
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
});
