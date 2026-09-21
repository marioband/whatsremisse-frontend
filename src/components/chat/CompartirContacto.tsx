import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { Alert } from '../../lib/alert';
import {
  ContactoCompartido,
  elegirContactoDelTelefono,
  haySelectorDeContactos,
} from '../../lib/contactosDelTelefono';
import { AZUL } from '../../lib/colors';

/**
 * «Compartir un contacto» (pedido del usuario, 20-09-2026).
 *
 * Lo pidió así: «que se abra la lista de contactos que tiene el usuario en su celular y pueda
 * seleccionar algun contacto para compartirlo en el chat». Eso se hace con la Contact Picker API
 * del navegador, que **Chrome de Android sí tiene y el Safari del iPhone no** (Apple no deja que
 * una web lea la agenda). Por eso esta ventana ofrece las dos vías y dice la verdad en cada caso:
 *   - Si el navegador tiene la lista («Elegir de mis contactos»), se abre y lo elegido se manda.
 *   - Si no la tiene, se escriben nombre y teléfono a mano y se manda la misma tarjeta.
 */
interface Props {
  visible: boolean;
  onCerrar: () => void;
  onEnviar: (contacto: ContactoCompartido) => void;
}

export function CompartirContacto({ visible, onCerrar, onEnviar }: Props) {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [eligiendo, setEligiendo] = useState(false);
  const puedeElegir = haySelectorDeContactos();

  // Cada vez que se abre, los campos arrancan vacíos: no se arrastra el contacto de la vez anterior.
  useEffect(() => {
    if (!visible) return;
    setNombre('');
    setTelefono('');
    setEligiendo(false);
  }, [visible]);

  const enviar = () => {
    const limpio: ContactoCompartido = { nombre: nombre.trim(), telefono: telefono.trim() };
    if (!limpio.nombre && !limpio.telefono) {
      Alert.alert('Falta el contacto', 'Escribe al menos el nombre o el teléfono.');
      return;
    }
    onEnviar(limpio);
  };

  const elegirDelTelefono = async () => {
    setEligiendo(true);
    const resultado = await elegirContactoDelTelefono();
    setEligiendo(false);
    if (!resultado.ok) {
      // Cerrar la lista sin elegir (cancelar) no es un fallo: no se avisa de nada.
      if (resultado.motivo === 'sin-datos') {
        Alert.alert('Ese contacto no tiene nombre ni teléfono', 'Prueba con otro contacto.');
      } else if (resultado.motivo === 'fallo') {
        Alert.alert(
          'No se pudo abrir la lista de contactos',
          'Escríbelo a mano y se enviará igual.'
        );
      }
      return;
    }
    onEnviar(resultado.valor);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <View style={styles.fondo}>
        <View style={styles.ventana}>
          <Text style={styles.titulo}>Compartir un contacto</Text>

          {puedeElegir ? (
            <TouchableOpacity
              style={[styles.botonElegir, eligiendo && styles.apagado]}
              onPress={elegirDelTelefono}
              disabled={eligiendo}
              accessibilityLabel="Elegir de mis contactos"
            >
              {eligiendo ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.botonElegirTexto}>Elegir de mis contactos</Text>
              )}
            </TouchableOpacity>
          ) : (
            <Text style={styles.nota}>
              Este navegador no deja abrir la lista de contactos del teléfono (en el iPhone es el
              sistema el que no lo permite). Escribe el nombre y el teléfono: se envía igual.
            </Text>
          )}

          <Text style={styles.label}>Nombre</Text>
          <TextInput
            style={styles.input}
            placeholder="Nombre del contacto"
            placeholderTextColor="#999"
            value={nombre}
            onChangeText={setNombre}
          />

          <Text style={styles.label}>Teléfono</Text>
          <TextInput
            style={styles.input}
            placeholder="Número de teléfono"
            placeholderTextColor="#999"
            value={telefono}
            onChangeText={setTelefono}
            keyboardType="phone-pad"
          />

          <View style={styles.botones}>
            <TouchableOpacity style={styles.botonCancelar} onPress={onCerrar}>
              <Text style={styles.botonCancelarTexto}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.botonEnviar} onPress={enviar}>
              <Text style={styles.botonEnviarTexto}>Enviar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  ventana: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  titulo: { fontSize: 18, fontWeight: 'bold', color: '#111', marginBottom: 14 },
  botonElegir: {
    backgroundColor: AZUL,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 14,
  },
  botonElegirTexto: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  apagado: { opacity: 0.6 },
  nota: { fontSize: 13, color: '#777', lineHeight: 18, marginBottom: 14 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6 },
  input: {
    backgroundColor: '#F2F2F2',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111',
    marginBottom: 14,
    // En web el navegador dibuja su recuadro de foco: la app no lo quiere (regla del proyecto).
    ...Platform.select({ web: { outlineStyle: 'none' } as object }),
  },
  botones: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  botonCancelar: { paddingVertical: 12, paddingHorizontal: 16 },
  botonCancelarTexto: { color: '#666', fontSize: 15, fontWeight: '600' },
  botonEnviar: {
    backgroundColor: AZUL,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  botonEnviarTexto: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
});
