import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { AZUL, TEXTO_SUAVE } from '../../lib/colors';
import { crearEnlaceDelSeguimiento } from '../../lib/database';
import { textoDeErrorParaElUsuario } from '../../lib/errors';
import { ServiceAlert } from '../../types';

interface CompartirViajeProps {
  service?: ServiceAlert | null;
  esProveedor: boolean;
}

/** ¿El viaje puede compartirse ahora mismo? (con conductor asignado y sin terminar) */
function viajeEnCurso(service?: ServiceAlert | null): boolean {
  if (!service || !service.assigned_driver_id) return false;
  return (
    service.status !== 'STATUS_OPEN' &&
    service.status !== 'STATUS_COMPLETED' &&
    service.status !== 'STATUS_CANCELLED'
  );
}

/**
 * «Compartir el viaje con el cliente» (0049): el botón del PROVEEDOR dentro del chat del
 * servicio. Solo aparece con el viaje en curso.
 *
 * Al tocarlo, la base crea (o devuelve, si ya existía) el enlace público del viaje y el
 * enlace queda COPIADO para mandarlo por WhatsApp. Si el seguimiento no está activo para la
 * cuenta, la base lo dice con un mensaje claro y ese mensaje se muestra.
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
    <View style={styles.zona}>
      <Pressable
        onPress={compartir}
        disabled={ocupado}
        style={[styles.boton, ocupado && styles.botonOcupado]}
      >
        <Text style={styles.texto}>
          {copiado ? '¡Enlace copiado!' : 'Compartir el viaje con el cliente'}
        </Text>
      </Pressable>
      <Text style={styles.nota}>Tu cliente lo abre sin cuenta y sigue la unidad en el mapa.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  zona: { width: '100%', paddingHorizontal: 12, paddingVertical: 6 },
  boton: { backgroundColor: AZUL, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  botonOcupado: { opacity: 0.6 },
  texto: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  nota: { color: TEXTO_SUAVE, fontSize: 11, textAlign: 'center', marginTop: 4 },
});
