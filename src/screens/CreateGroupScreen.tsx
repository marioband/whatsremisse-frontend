import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Image,
  ActivityIndicator,
} from 'react-native';

import { useMockStore } from '../context/MockStoreContext';
import { useAuth } from '../context/AuthContext';
import { Alert } from '../lib/alert';
import { elegirFoto, fueCancelado, subirFoto, tomarFoto } from '../lib/adjuntos';
import { textoDeErrorParaElUsuario } from '../lib/errors';
import { RootStackParamList } from '../navigation/RootNavigator';

type CreateGroupNav = StackNavigationProp<RootStackParamList, 'CreateGroup'>;

const DARK_BG = '#2D2D2D';
const BLUE = '#3F51B5';

export function CreateGroupScreen() {
  const navigation = useNavigation<CreateGroupNav>();
  const { addGroup } = useMockStore();
  const { session } = useAuth();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  /**
   * Foto del grupo (0038). Es OPCIONAL de principio a fin: se puede escribir el nombre y crear el
   * grupo sin ella. Antes el «avatar» era un 📷 decorativo que, al tocarlo (o al tocar el nombre,
   * porque el campo estaba DENTRO del botón), abría el aviso «Selecciona un avatar para el grupo» y
   * el grupo no se podía crear (reportado por el usuario, 20-09-2026).
   */
  const [foto, setFoto] = useState<string | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Nombre requerido', 'Ingresa un nombre para el grupo.');
      return;
    }
    if (creating) return;

    setCreating(true);
    try {
      await addGroup({
        id: '',
        name: name.trim(),
        role: 'owner',
        favorite: false,
        avatarUrl: foto,
      });
      navigation.goBack();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[CreateGroup] no se pudo crear el grupo:', err);
      Alert.alert('No se pudo crear el grupo', textoDeErrorParaElUsuario(err));
    } finally {
      setCreating(false);
    }
  };

  /** Elige la foto del grupo tocando SU círculo (no la barra entera): sube la imagen al almacén. */
  const pedirYSubirFoto = async (origen: 'camara' | 'galeria') => {
    const elegida = origen === 'camara' ? await tomarFoto() : await elegirFoto();
    if (!elegida.ok) {
      // Cancelar no es un fallo: no se avisa de nada. Y si falla, tampoco se bloquea el grupo.
      if (!fueCancelado(elegida)) Alert.alert('No se pudo usar la foto', elegida.motivo);
      return;
    }
    const userId = session?.user?.id || '';
    if (!userId) {
      Alert.alert('No se pudo subir la foto', 'Vuelve a entrar a tu cuenta e inténtalo de nuevo.');
      return;
    }
    setSubiendoFoto(true);
    const subida = await subirFoto(elegida.valor, userId);
    setSubiendoFoto(false);
    if (!subida.ok) {
      Alert.alert('No se pudo subir la foto', subida.motivo);
      return;
    }
    setFoto(subida.valor);
  };

  const handlePickPhoto = () => {
    Alert.alert('Foto del grupo', '¿De dónde sacamos la foto?', [
      { text: 'Tomar foto', onPress: () => pedirYSubirFoto('camara') },
      { text: 'Elegir de la galería', onPress: () => pedirYSubirFoto('galeria') },
      // Solo tiene sentido si ya hay una foto puesta.
      ...(foto
        ? [{ text: 'Quitar la foto', style: 'destructive' as const, onPress: () => setFoto(null) }]
        : []),
      { text: 'Cancelar', style: 'cancel' as const },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nuevo grupo</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Body */}
      <View style={styles.body}>
        {/* La barra NO es un botón: dentro van dos zonas independientes — el círculo de la foto y el
            campo del nombre. Así, escribir el nombre nunca abre el aviso de la foto. */}
        <View style={styles.pillContainer}>
          <TouchableOpacity
            style={styles.avatar}
            onPress={handlePickPhoto}
            disabled={subiendoFoto}
            accessibilityLabel="Foto del grupo"
            accessibilityHint="Toca para tomar una foto o elegirla de la galería. Es opcional."
          >
            {subiendoFoto ? (
              <ActivityIndicator color="#fff" />
            ) : foto ? (
              <Image source={{ uri: foto }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarText}>📷</Text>
            )}
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="Ingresa Nombre"
            placeholderTextColor="#999"
            value={name}
            onChangeText={setName}
            autoFocus
          />
        </View>

        <Text style={styles.pista}>
          La foto es opcional: puedes crear el grupo solo con el nombre.
        </Text>
      </View>

      {/* Action button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.createBtn, (creating || subiendoFoto) && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={creating || subiendoFoto}
        >
          <Text style={styles.createText}>
            {creating ? 'Creando...' : subiendoFoto ? 'Subiendo la foto...' : 'Crear'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DARK_BG,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backBtn: {
    padding: 4,
  },
  backArrow: {
    color: '#fff',
    fontSize: 24,
  },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 28,
  },
  body: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
    paddingTop: 30,
  },
  pillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F2',
    borderRadius: 30,
    padding: 12,
    paddingHorizontal: 16,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: DARK_BG,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    overflow: 'hidden',
  },
  avatarImg: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    paddingVertical: 8,
  },
  pista: {
    marginTop: 12,
    fontSize: 12,
    color: '#777',
  },
  footer: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
  },
  createBtn: {
    backgroundColor: BLUE,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 80,
    alignItems: 'center',
  },
  createBtnDisabled: {
    opacity: 0.6,
  },
  createText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
