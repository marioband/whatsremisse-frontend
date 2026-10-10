import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';

import { AZUL, FONDO_TARJETA } from '../../lib/colors';
import { pedidoDeUbicacionDelServicio, pedirUbicacionDelConductor } from '../../lib/database';
import { textoDeErrorParaElUsuario } from '../../lib/errors';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { ServiceAlert } from '../../types';

/** Cada cuánto se relee el estado del pedido mientras la tarjeta está a la vista. */
const CADA_MS = 8000;

/**
 * «Ver ubicación» del PROVEEDOR (0053, 10-10-2026).
 *
 * Es la franja gris con el pin que vive al final del pie de la tarjeta del chat (debajo del
 * bloque de los copiados). Ahora hace algo:
 *   - sin pedido (o rechazado/caducado): tocar PIDE la ubicación al conductor;
 *   - PEDIDO: «Pidiendo ubicación al conductor…» — el reloj relee y el estado cambia solo;
 *   - ACEPTADO: «Ver el mapa en vivo» — abre la pantalla con el mapa del conductor;
 *   - CORTADO: lo avisa y deja volver a pedir.
 * La decisión de aceptar es del conductor: aquí solo se pide y se mira.
 */
export function VerUbicacionDelConductor({ service }: { service: ServiceAlert }) {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const [estado, setEstado] = useState<string | null>(null);
  const [pidiendo, setPidiendo] = useState(false);
  const montado = useRef(true);

  const refrescar = useCallback(async () => {
    try {
      const pedido = await pedidoDeUbicacionDelServicio(service.id);
      if (montado.current) setEstado(pedido?.estado ?? null);
    } catch {
      // Es un aviso del pie: si la base no responde, se queda como «Ver ubicación».
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

  const vivo = estado === 'PEDIDO' || estado === 'ACEPTADO';

  const alTocar = async () => {
    if (pidiendo) return;
    if (estado === 'ACEPTADO') {
      navigation.navigate('UbicacionDeLaUnidad', { serviceId: service.id });
      return;
    }
    if (vivo) return; // esperando al conductor: el reloj refresca solo
    setPidiendo(true);
    try {
      const pedido = await pedirUbicacionDelConductor(service.id);
      setEstado(pedido.estado);
    } catch (err) {
      Alert.alert('No se pudo pedir la ubicación', textoDeErrorParaElUsuario(err));
    } finally {
      setPidiendo(false);
    }
  };

  let etiqueta = 'Ver ubicación';
  if (estado === 'PEDIDO') etiqueta = 'Pidiendo ubicación al conductor…';
  if (estado === 'ACEPTADO') etiqueta = 'Ver el mapa en vivo';

  let nota: string | null = null;
  if (estado === 'RECHAZADO') nota = 'El conductor no aceptó — toca para pedir otra vez';
  if (estado === 'CADUCADO') nota = 'El pedido caducó — toca para volver a pedir';
  if (estado === 'CORTADO') nota = 'El conductor dejó de compartir — puedes pedir otra vez';

  return (
    <View style={styles.zona}>
      <TouchableOpacity
        style={styles.fila}
        onPress={alTocar}
        activeOpacity={0.85}
        disabled={pidiendo || estado === 'PEDIDO'}
        accessibilityRole="button"
      >
        <MaterialCommunityIcons
          name="map-marker"
          size={20}
          color={estado === 'ACEPTADO' ? AZUL : '#555555'}
          style={styles.icono}
        />
        <Text style={[styles.texto, estado === 'ACEPTADO' && styles.textoActivo]}>{etiqueta}</Text>
      </TouchableOpacity>
      {nota ? <Text style={styles.nota}>{nota}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /** La misma franja gris del pie: el MISMO color de la tarjeta y su línea blanca arriba. */
  zona: {
    backgroundColor: FONDO_TARJETA,
    borderTopWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  icono: { marginRight: 8 },
  texto: { color: '#555555', fontSize: 15, fontWeight: '600' },
  /** Aceptado: la acción de verdad (abrir el mapa) va en azul institucional. */
  textoActivo: { color: AZUL },
  nota: {
    textAlign: 'center',
    color: '#8A8A8A',
    fontSize: 12,
    paddingBottom: 10,
    marginTop: -4,
  },
});
