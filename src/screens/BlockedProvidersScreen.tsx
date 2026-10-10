import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';

import { Fab } from '../components/Fab';
import { Alert } from '../lib/alert';
import { RootStackParamList } from '../navigation/RootNavigator';
import { BlockedUser } from '../types';
import { IconoDeAtras } from '../components/IconoDeAtras';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { TEXTO_TENUE } from '../lib/colors';
import { cargarMisBloqueos, desbloquearCuenta } from '../lib/database';

type BlockedNav = StackNavigationProp<RootStackParamList, 'BlockedProviders'>;

const DARK_BG = '#2D2D2D';

/**
 * Proveedores bloqueados (0055 desde la base): aquí viven los bloqueos hechos desde esta
 * lista. Antes la lista era de mentira (se vaciaba al salir) y el «+» abría un aviso de
 * relleno; ahora el «+» lleva a buscar a la persona y todo se guarda en la cuenta.
 */
export function BlockedProvidersScreen() {
  const navigation = useNavigation<BlockedNav>();
  const [providers, setProviders] = useState<BlockedUser[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const lista = await cargarMisBloqueos();
      setProviders(
        lista
          .filter((b) => b.vista === 'PROVEEDOR')
          .map((b) => ({
            id: b.id,
            name: b.full_name || b.phone || 'Cuenta sin nombre',
            phone: b.phone,
            vista: b.vista,
          }))
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[Bloqueados] no se pudo leer la lista:', err);
    } finally {
      setCargando(false);
    }
  }, []);

  // Al volver de la pantalla de bloqueo (o de la ficha), la lista se relee sola.
  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar])
  );

  const handleAdd = () => {
    navigation.navigate('ElegirBloqueo', { vista: 'PROVEEDOR' });
  };

  const handleUnblock = (id: string, name: string) => {
    Alert.alert('Desbloquear proveedor', `¿Estás seguro de desbloquear a ${name}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desbloquear',
        onPress: () => {
          desbloquearCuenta(id)
            .then(() => void cargar())
            .catch((err) => {
              // eslint-disable-next-line no-console
              console.warn('[Bloqueados] no se pudo desbloquear:', err);
              Alert.alert('No se pudo desbloquear', 'Inténtalo de nuevo en un momento.');
            });
        },
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
      <View style={styles.textos}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        {!!item.phone && <Text style={styles.phone}>{item.phone}</Text>}
      </View>
      <TouchableOpacity
        style={styles.removeBtn}
        onPress={() => handleUnblock(item.id, item.name)}
        accessibilityLabel={`Desbloquear a ${item.name}`}
      >
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
        <Text style={styles.headerTitle}>Proveedores bloqueados</Text>
        <View style={styles.headerIconBtn} />
      </View>

      {cargando && providers.length === 0 ? (
        <ActivityIndicator style={styles.cargando} color={TEXTO_TENUE} />
      ) : (
        <FlatList
          data={providers}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No tienes proveedores bloqueados.</Text>
          }
        />
      )}

      {/* FAB */}
      <Fab etiqueta="Bloquear un proveedor" onPress={handleAdd} />
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
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  headerIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  cargando: { marginTop: 40 },
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
  textos: { flex: 1 },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  phone: { fontSize: 13, color: TEXTO_TENUE, marginTop: 2 },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#C2333F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: { textAlign: 'center', color: TEXTO_TENUE, marginTop: 40, fontSize: 14 },
});
