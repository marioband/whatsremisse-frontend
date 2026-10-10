import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { AZUL } from '../../lib/colors';
import { crearEnlaceDelSeguimiento } from '../../lib/database';
import { textoDeErrorParaElUsuario } from '../../lib/errors';
import { ServiceAlert } from '../../types';

interface CompartirViajeProps {
  service?: ServiceAlert | null;
  esProveedor: boolean;
}

/** ¿El viaje puede compartirse ahora mismo? (asignado y sin terminar) */
function viajeEnCurso(service?: ServiceAlert | null): boolean {
  if (!service || !service.assigned_driver_id) return false;
  return (
    service.status !== 'STATUS_OPEN' &&
    service.status !== 'STATUS_COMPLETED' &&
    service.status !== 'STATUS_CANCELLED'
  );
}

/**
 * «Compartir viaje» (0049): el botón LARGO azul institucional del pie de la tarjeta del chat
 * (diseño del usuario, 09-10-2026).
 *
 * Al tocarlo, la base crea (o devuelve, si ya existe) el enlace público del viaje y este queda
 * COPIADO para mandarlo por WhatsApp. Si el seguimiento no está activo para la cuenta, la base
 * lo dice con un mensaje claro.
 */
export function CompartirViaje({ service, esProveedor }: CompartirViajeProps) {
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);

  if (!esProveedor || !viajeEnCurso(service)) return null;

  const compartir = async () => {
    if (ocupado || !service) return;
    setOcupado(true);
    try {
      const enlace = await crearEnlaceDelSeguimiento(service.id);
      const url = `https://whatsremisse.tech${enlace.url}`;
      await Clipboard.setStringAsync(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 3000);
      Alert.alert(
        'Enlace copiado',
        'Mándaselo a tu cliente por WhatsApp: verá el viaje en vivo (unidad, placa y conductor). ' +
          'Puedes volver a copiarlo con este botón cuando quieras.'
      );
    } catch (err) {
      Alert.alert('No se pudo crear el enlace', textoDeErrorParaElUsuario(err));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Pressable
      onPress={compartir}
      disabled={ocupado}
      style={[styles.boton, ocupado && styles.botonOcupado]}
      accessibilityRole="button"
    >
      <MaterialCommunityIcons name="share" size={20} color="#FFFFFF" style={styles.icono} />
      <Text style={styles.texto}>{copiado ? '¡Enlace copiado!' : 'Compartir viaje'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  boton: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AZUL,
    borderRadius: 12,
    // El bloque gris de abajo llega hasta los bordes de la tarjeta; el azul lleva su margen.
    marginHorizontal: 12,
    paddingVertical: 14,
    marginBottom: 10,
  },
  botonOcupado: { opacity: 0.6 },
  icono: { marginRight: 8 },
  texto: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
