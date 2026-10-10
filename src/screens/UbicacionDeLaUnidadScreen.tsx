import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';

import { pedidoDeUbicacionDelServicio } from '../lib/database';
import type { RootStackParamList } from '../navigation/RootNavigator';

/** Cada cuánto se relee el estado del pedido mientras esta pantalla está abierta. */
const CADA_MS = 15000;

/** El iframe: en la web el mapa es la misma página propia que ve el cliente (coste S/ 0). */
const EtiquetaIframe = 'iframe' as unknown as React.ComponentType<{
  src: string;
  style: React.CSSProperties;
  title: string;
}>;

/**
 * «Ver ubicación» del proveedor (0053, 10-10-2026): la pantalla con el mapa EN VIVO del
 * conductor, dentro de la app. El mapa es la página propia `/viaje/unidad/<token>` (MapLibre +
 * Protomaps del VPS), embebida tal cual en la web; en un teléfono nativo se abre en el navegador.
 *
 * El estado se relee cada 15 s: si el conductor deja de compartir, la pantalla lo refleja
 * (la propia página también lo dice en su mapa).
 */
export function UbicacionDeLaUnidadScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'UbicacionDeLaUnidad'>>();
  const serviceId = route.params?.serviceId ?? '';
  const [token, setToken] = useState<string | null>(null);
  const [revisado, setRevisado] = useState(false);
  const montado = useRef(true);

  const mirar = useCallback(async () => {
    try {
      const pedido = await pedidoDeUbicacionDelServicio(serviceId);
      if (!montado.current) return;
      setToken(pedido?.estado === 'ACEPTADO' ? pedido.token : null);
    } catch {
      if (montado.current) setToken(null);
    } finally {
      if (montado.current) setRevisado(true);
    }
  }, [serviceId]);

  useEffect(() => {
    montado.current = true;
    void mirar();
    const reloj = setInterval(() => void mirar(), CADA_MS);
    return () => {
      montado.current = false;
      clearInterval(reloj);
    };
  }, [mirar]);

  const ruta = token ? `/viaje/unidad/${token}` : '';

  return (
    <View style={styles.pantalla}>
      <View style={styles.cabecera}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.volver}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons name="chevron-left" size={26} color="#FFFFFF" />
          <Text style={styles.volverTexto}>Volver</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Ubicación del conductor</Text>
        <View style={styles.hueco} />
      </View>

      {token && Platform.OS === 'web' ? (
        <View style={styles.mapa}>
          <EtiquetaIframe src={ruta} style={styles.iframe} title="Ubicación del conductor" />
        </View>
      ) : token ? (
        <View style={styles.centro}>
          <Text style={styles.texto}>El mapa se abre en el navegador del teléfono.</Text>
          <TouchableOpacity
            style={styles.boton}
            onPress={() => void Linking.openURL('https://whatsremisse.tech' + ruta)}
          >
            <Text style={styles.botonTexto}>Abrir el mapa en vivo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.centro}>
          <Text style={styles.texto}>
            {revisado
              ? 'El conductor no está compartiendo su ubicación. Puedes pedírsela otra vez desde el chat.'
              : 'Comprobando la compartición…'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: '#F4F4F2' },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2D2D2D',
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 12,
  },
  volver: { flexDirection: 'row', alignItems: 'center', minWidth: 84 },
  volverTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  titulo: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  hueco: { minWidth: 84 },
  mapa: { flex: 1 },
  iframe: { width: '100%', height: '100%', border: '0' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  texto: {
    color: '#555555',
    fontSize: 14,
    textAlign: 'center',
    // PÍXELES, no multiplicador (ver `PideTuUbicacion`): 20 para 14 px, como la casa.
    lineHeight: 20,
  },
  boton: {
    backgroundColor: '#3F51B5',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 22,
    marginTop: 6,
  },
  botonTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
