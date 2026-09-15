import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal } from 'react-native';

import { useMockStore } from '../context/MockStoreContext';
import { Alert } from '../lib/alert';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const BLUE = '#3F51B5';
const DARK_BG = '#2D2D2D';

export function CreateGroupModal({ visible, onClose }: Props) {
  const { addGroup } = useMockStore();
  const [name, setName] = useState('');

  const handleCreate = () => {
    if (!name.trim()) {
      Alert.alert('Nombre requerido', 'Ingresa un nombre para el grupo.');
      return;
    }

    addGroup({
      id: `group-${Date.now()}`,
      name: name.trim(),
      role: 'owner',
      favorite: false,
    });

    setName('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>Crear nuevo grupo</Text>
          <Text style={styles.label}>Nombre del grupo</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Mi Flota"
            placeholderTextColor="#999"
            value={name}
            onChangeText={setName}
          />
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={onClose}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.createBtn]} onPress={handleCreate}>
              <Text style={styles.createText}>Crear</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: DARK_BG,
    marginBottom: 16,
    textAlign: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    color: '#333',
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelBtn: {
    backgroundColor: '#eee',
    marginRight: 10,
  },
  cancelText: {
    color: '#555',
    fontWeight: '600',
  },
  createBtn: {
    backgroundColor: BLUE,
    marginLeft: 10,
  },
  createText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
