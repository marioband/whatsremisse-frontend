import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView } from 'react-native';

import { useMockStore } from '../context/MockStoreContext';
import { Alert } from '../lib/alert';
import { gruposDeServicio } from '../lib/gruposDeServicio';
import { RootStackParamList } from '../navigation/RootNavigator';

type SelectNav = StackNavigationProp<RootStackParamList, 'SelectGroupsForService' | 'Settings'>;
type SelectRoute = RouteProp<RootStackParamList, 'SelectGroupsForService'>;

const DARK_BG = '#2D2D2D';
const BLUE = '#3F51B5';

const ROLE_COLORS = {
  owner: '#C0C7E8',
  admin: '#B2E3BF',
  member: '#F2F2F2',
  favorite: '#FFF59E',
};

type RoleTab = 'Conductor' | 'Proveedor' | 'Mis Grupos' | 'Ubicaciones';
const ROLE_TABS: RoleTab[] = ['Conductor', 'Proveedor', 'Mis Grupos', 'Ubicaciones'];

export function SelectGroupsForServiceScreen() {
  const navigation = useNavigation<SelectNav>();
  const route = useRoute<SelectRoute>();
  const { draftService, serviceId } = route.params;
  const { role, setRole, groups, addService, updateService, compartirServicio, emitNotification } =
    useMockStore();

  // Si la tarjeta ya está compartida, sus grupos vienen marcados: el "Enviar" vuelve
  // a dejar el conjunto completo (quitar uno lo descomparte de ese grupo).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(gruposDeServicio(draftService))
  );

  const activeRoleTab: RoleTab =
    role === 'DRIVER'
      ? 'Conductor'
      : role === 'PROVIDER'
        ? 'Proveedor'
        : role === 'GROUP_OWNER'
          ? 'Mis Grupos'
          : 'Ubicaciones';

  const handleRoleChange = (tab: RoleTab) => {
    if (tab === 'Conductor') setRole('DRIVER');
    if (tab === 'Proveedor') setRole('PROVIDER');
    if (tab === 'Mis Grupos') setRole('GROUP_OWNER');
    if (tab === 'Ubicaciones') setRole('ADMIN');
    navigation.navigate('Main');
  };

  const toggleGroup = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getCardColor = (group: { role: 'owner' | 'admin' | 'member'; favorite: boolean }) => {
    if (group.favorite) return ROLE_COLORS.favorite;
    return ROLE_COLORS[group.role];
  };

  const handleSend = async () => {
    if (selectedIds.size === 0) {
      Alert.alert('Selecciona grupos', 'Elige al menos un grupo para publicar el servicio.');
      return;
    }

    // El orden en que se eligieron importa: el primero es el grupo principal.
    const seleccionados = Array.from(selectedIds);

    if (serviceId) {
      // Tarjeta que YA existe (venía de "nuevo servicio"): se comparte con TODOS los
      // grupos elegidos en el MISMO servicio (0018). Antes se creaba una tarjeta por
      // grupo, así que el conductor que estaba en varios grupos recibía la misma
      // alerta varias veces.
      updateService({ ...draftService, id: serviceId });
      const compartido = await compartirServicio(serviceId, seleccionados);
      if (!compartido) return;
      emitNotification(serviceId, draftService.title);
      Alert.alert(
        'Servicio compartido',
        seleccionados.length === 1
          ? 'La tarjeta ya está publicada en el grupo elegido.'
          : `La tarjeta está publicada en ${seleccionados.length} grupos. Es un solo servicio: los conductores que estén en varios grupos lo ven una sola vez.`
      );
      navigation.navigate('Main');
      return;
    }

    // Tarjeta nueva: se publica UNA vez y se comparte con todos los grupos elegidos.
    const id = await addService({ ...draftService, group_id: '' }, seleccionados);
    if (!id) return;

    // Se notifica una sola vez por servicio, aunque se comparta a varios grupos.
    emitNotification(id, draftService.title);

    navigation.navigate('Main');
  };

  const renderGroup = ({
    item,
  }: {
    item: { id: string; name: string; role: 'owner' | 'admin' | 'member'; favorite: boolean };
  }) => {
    const selected = selectedIds.has(item.id);

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: getCardColor(item) }]}
        onPress={() => toggleGroup(item.id)}
        activeOpacity={0.8}
      >
        <View style={styles.leftContent}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
          </View>
          <Text style={styles.groupName} numberOfLines={1}>
            {item.name}
          </Text>
        </View>

        <View style={[styles.selector, selected && styles.selectorActive]}>
          {selected && <Text style={styles.check}>✓</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>WhatsRemisse</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.iconBtn}>
            <Text style={styles.icon}>👤</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Settings')}>
            <Text style={styles.icon}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Role tabs */}
      <View style={styles.roleBar}>
        {ROLE_TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.roleTab, activeRoleTab === tab && styles.roleTabActive]}
            onPress={() => handleRoleChange(tab)}
          >
            <Text style={[styles.roleTabText, activeRoleTab === tab && styles.roleTabTextActive]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Group list */}
      <FlatList
        data={groups}
        keyExtractor={(item) => item.id}
        renderItem={renderGroup}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>No hay grupos disponibles</Text>}
      />

      {/* Send button */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
          <Text style={styles.sendText}>Enviar</Text>
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
    justifyContent: 'space-between',
    backgroundColor: DARK_BG,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerIcons: {
    flexDirection: 'row',
  },
  iconBtn: {
    marginLeft: 16,
    padding: 4,
  },
  icon: {
    color: '#fff',
    fontSize: 20,
  },
  roleBar: {
    flexDirection: 'row',
    backgroundColor: DARK_BG,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  roleTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  roleTabActive: {
    backgroundColor: BLUE,
  },
  roleTabText: {
    color: '#ccc',
    fontSize: 12,
    fontWeight: '600',
  },
  roleTabTextActive: {
    color: '#fff',
  },
  list: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 30,
    padding: 12,
    paddingHorizontal: 16,
    marginVertical: 8,
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: DARK_BG,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  groupName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },
  selector: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#bbb',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectorActive: {
    backgroundColor: BLUE,
    borderColor: BLUE,
  },
  check: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 40,
  },
  footer: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderTopWidth: 0.5,
    borderTopColor: '#ddd',
    alignItems: 'center',
  },
  sendBtn: {
    backgroundColor: BLUE,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 80,
    alignItems: 'center',
  },
  sendText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
