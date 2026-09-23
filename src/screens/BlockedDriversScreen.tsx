import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';

import { Fab } from '../components/Fab';
import { Alert } from '../lib/alert';
import { RootStackParamList } from '../navigation/RootNavigator';
import { BlockedUser } from '../types';
import { IconoDeAtras } from '../components/IconoDeAtras';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type BlockedNav = StackNavigationProp<RootStackParamList, 'BlockedDrivers'>;

const DARK_BG = '#2D2D2D';

export function BlockedDriversScreen() {
  const navigation = useNavigation<BlockedNav>();
  const [drivers, setDrivers] = useState<BlockedUser[]>([]);

  const handleAdd = () => {
    Alert.alert('Agregar conductor', 'Aquí se abriría la búsqueda de conductores para bloquear.');
  };

  const handleUnblock = (id: string, name: string) => {
    Alert.alert('Desbloquear conductor', `¿Estás seguro de desbloquear a ${name}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desbloquear',
        onPress: () => setDrivers((prev) => prev.filter((d) => d.id !== id)),
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
        <MaterialCommunityIcons name="close" size={16} color="#fff" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <IconoDeAtras />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Conductores bloqueados</Text>
        <View style={styles.headerIconBtn} />
      </View>

      <FlatList
        data={drivers}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>No tienes conductores bloqueados.</Text>}
      />

      {/* FAB */}
      <Fab etiqueta="Agregar conductor bloqueado" onPress={handleAdd} />
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
    paddingBottom: 16,
    paddingHorizontal: 16,
    minHeight: 102,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backArrow: { color: '#fff', fontSize: 24 },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  headerIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
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
    backgroundColor: '#C2333F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  emptyText: { textAlign: 'center', color: '#888', marginTop: 40, fontSize: 14 },
});
