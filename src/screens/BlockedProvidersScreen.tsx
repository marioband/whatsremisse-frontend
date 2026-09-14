import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';

import { RootStackParamList } from '../navigation/RootNavigator';
import { BlockedUser } from '../types';

type BlockedNav = StackNavigationProp<RootStackParamList, 'BlockedProviders'>;

const DARK_BG = '#2D2D2D';

export function BlockedProvidersScreen() {
  const navigation = useNavigation<BlockedNav>();
  const [providers, setProviders] = useState<BlockedUser[]>([]);

  const handleAdd = () => {
    Alert.alert('Agregar proveedor', 'Aquí se abriría la búsqueda de proveedores para bloquear.');
  };

  const handleUnblock = (id: string, name: string) => {
    Alert.alert('Desbloquear proveedor', `¿Estás seguro de desbloquear a ${name}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desbloquear',
        onPress: () => setProviders((prev) => prev.filter((p) => p.id !== id)),
      },
    ]);
  };

  const renderItem = ({ item }: { item: BlockedUser }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('BlockedUserProfile', { user: item })}
      activeOpacity={0.8}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
      </View>
      <Text style={styles.name}>{item.name}</Text>
      <TouchableOpacity style={styles.removeBtn} onPress={() => handleUnblock(item.id, item.name)}>
        <Text style={styles.removeText}>✕</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Proveedores bloqueados</Text>
        <TouchableOpacity style={styles.headerIconBtn}>
          <Text style={styles.headerIcon}>🏢</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={providers}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>No tienes proveedores bloqueados.</Text>}
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={handleAdd}>
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: DARK_BG,
    paddingTop: 50,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  backBtn: { padding: 4 },
  backArrow: { color: '#fff', fontSize: 24 },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  headerIconBtn: { padding: 4 },
  headerIcon: { fontSize: 22 },
  list: { padding: 16, paddingBottom: 100 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F2',
    borderRadius: 30,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: DARK_BG,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  emptyText: { textAlign: 'center', color: '#888', marginTop: 40, fontSize: 14 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: DARK_BG,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
  fabIcon: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
});
