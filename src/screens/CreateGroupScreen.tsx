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
  Alert,
} from 'react-native';

import { useMockStore } from '../context/MockStoreContext';
import { RootStackParamList } from '../navigation/RootNavigator';

type CreateGroupNav = StackNavigationProp<RootStackParamList, 'CreateGroup'>;

const DARK_BG = '#2D2D2D';
const BLUE = '#3F51B5';

/**
 * Convierte cualquier error (Supabase/PostgREST, red, etc.) en un texto legible
 * para mostrarlo en un Alert. Nunca deja el fallo en silencio.
 */
function describeError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [e.message, e.code ? `Código: ${e.code}` : undefined, e.details, e.hint].filter(
      (part): part is string => Boolean(part)
    );
    if (parts.length > 0) return parts.join('\n');
  }
  return String(err);
}

export function CreateGroupScreen() {
  const navigation = useNavigation<CreateGroupNav>();
  const { addGroup } = useMockStore();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

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
      });
      navigation.goBack();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[CreateGroup] no se pudo crear el grupo:', err);
      Alert.alert('No se pudo crear el grupo', describeError(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nuevo Grupal</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Body */}
      <View style={styles.body}>
        <TouchableOpacity
          style={styles.pillContainer}
          onPress={() => Alert.alert('Avatar', 'Selecciona un avatar para el grupo.')}
        >
          {/* Avatar placeholder */}
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>📷</Text>
          </View>

          {/* Name input */}
          <TextInput
            style={styles.input}
            placeholder="Ingresa Nombre"
            placeholderTextColor="#999"
            value={name}
            onChangeText={setName}
          />
        </TouchableOpacity>
      </View>

      {/* Action button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.createBtn, creating && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={creating}
        >
          <Text style={styles.createText}>{creating ? 'Creando...' : 'Crear'}</Text>
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
