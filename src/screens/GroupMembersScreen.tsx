import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { useMockStore, GroupMember, rolEnGrupo } from '../context/MockStoreContext';
import { Alert } from '../lib/alert';
import { displayName, initialOf, memberRoleLabel } from '../lib/names';
import { RootStackParamList } from '../navigation/RootNavigator';

type MembersNav = StackNavigationProp<RootStackParamList, 'GroupMembers'>;
type MembersRoute = RouteProp<RootStackParamList, 'GroupMembers'>;

const DARK_BG = '#2D2D2D';

export function GroupMembersScreen() {
  const navigation = useNavigation<MembersNav>();
  const route = useRoute<MembersRoute>();
  const { groupId, groupName } = route.params;
  const { role, groups, members, updateMemberRole, removeMember, loadGroupMembers, reloadGroups } =
    useMockStore();
  const { session } = useAuth();

  // Rol del usuario en ESTE grupo: el creador (groups.owner_id) siempre es owner;
  // si no lo es, manda su fila de miembro. Es el mismo criterio que aplica la
  // política RLS de group_members: solo owner y admin pueden dar de alta.
  const fallbackRole: 'owner' | 'admin' | 'member' =
    role === 'GROUP_OWNER' ? 'owner' : role === 'ADMIN' ? 'admin' : 'member';
  const viewerGroupRole = rolEnGrupo(groups, groupId, session?.user?.id, fallbackRole);
  const canAddMembers = viewerGroupRole === 'owner' || viewerGroupRole === 'admin';

  useEffect(() => {
    // Refrescamos grupos (rol y creador) e integrantes al abrir la pantalla: el
    // permiso mostrado no debe depender de lo cargado al inicio de la sesión.
    reloadGroups();
    loadGroupMembers(groupId);
  }, [groupId, loadGroupMembers, reloadGroups]);

  const groupMembers = useMemo(() => members[groupId] || [], [members, groupId]);

  // Integrantes cuya fila de `profiles` no se pudo leer (o que todavía no
  // completaron sus datos): sin esto la pantalla mostraba UUIDs y campos vacíos
  // sin decir por qué.
  const membersSinPerfil = groupMembers.filter((m) => m.profileFound === false).length;

  const handlePress = (member: GroupMember) => {
    navigation.navigate('ParticipantDetail', {
      groupId,
      memberId: member.id,
      memberName: displayName([member.name]),
      memberRole: member.role,
    });
  };

  const handleLongPress = (
    memberId: string,
    memberName: string,
    memberRole: 'owner' | 'admin' | 'member'
  ) => {
    if (viewerGroupRole === 'owner') {
      const isAdmin = memberRole === 'admin';
      Alert.alert(memberName, 'Selecciona una acción', [
        {
          text: isAdmin ? 'Desasignar Administrador' : 'Asignar Administrador',
          onPress: () => updateMemberRole(groupId, memberId, isAdmin ? 'member' : 'admin'),
        },
        {
          text: 'Eliminar Integrante',
          style: 'destructive',
          onPress: () => removeMember(groupId, memberId),
        },
        { text: 'Cancelar', style: 'cancel' },
      ]);
    } else if (viewerGroupRole === 'admin') {
      if (memberRole === 'owner') {
        Alert.alert('No permitido', 'No puedes eliminar al Propietario.');
        return;
      }
      Alert.alert(memberName, 'Selecciona una acción', [
        {
          text: 'Eliminar Integrante',
          style: 'destructive',
          onPress: () => removeMember(groupId, memberId),
        },
        { text: 'Cancelar', style: 'cancel' },
      ]);
    }
  };

  const renderMember = ({ item }: { item: GroupMember }) => {
    const nombre = displayName([item.name]);
    const rol = memberRoleLabel(item.role);
    return (
      <TouchableOpacity
        style={styles.memberPill}
        onPress={() => handlePress(item)}
        onLongPress={() => handleLongPress(item.id, nombre, item.role)}
        activeOpacity={0.8}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initialOf(nombre)}</Text>
        </View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberName} numberOfLines={1}>
            {nombre}
          </Text>
          {item.profileFound === false ? (
            <Text style={styles.memberSub} numberOfLines={1}>
              Sin datos de perfil
            </Text>
          ) : rol && rol !== 'Integrante' ? (
            <Text style={styles.memberSub} numberOfLines={1}>
              {rol}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {groupName}
        </Text>
        <View style={styles.logoPlaceholder}>
          <Text style={styles.logoText}>👤</Text>
        </View>
      </View>

      {/* Member list */}
      <FlatList
        data={groupMembers}
        keyExtractor={(item) => item.id}
        renderItem={renderMember}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>No hay integrantes</Text>}
        ListFooterComponent={
          membersSinPerfil > 0 ? (
            <Text style={styles.warnText}>
              {membersSinPerfil === 1
                ? '1 integrante todavía no tiene nombre ni teléfono en su perfil.'
                : `${membersSinPerfil} integrantes todavía no tienen nombre ni teléfono en su perfil.`}{' '}
              Si sus datos sí están guardados, falta aplicar la migración 0005 en Supabase
              (funciones group_member_profiles / public_profile).
            </Text>
          ) : null
        }
      />

      {/* FAB: solo para owner/admin, igual que la política RLS de group_members */}
      {canAddMembers ? (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('AddParticipant', { groupId, groupName })}
        >
          <Text style={styles.fabIcon}>+</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.memberNote}>
          Solo el propietario o un administrador del grupo pueden agregar integrantes
        </Text>
      )}
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
    marginHorizontal: 12,
  },
  logoPlaceholder: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#555',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    color: '#fff',
    fontSize: 16,
  },
  list: {
    padding: 16,
    paddingBottom: 100,
  },
  memberPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F2',
    borderRadius: 30,
    padding: 12,
    paddingHorizontal: 16,
    marginVertical: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: DARK_BG,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  memberInfo: {
    flex: 1,
    marginLeft: 4,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  memberSub: {
    fontSize: 12,
    color: '#777',
    marginTop: 2,
  },
  warnText: {
    marginTop: 18,
    color: '#B00020',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 40,
  },
  memberNote: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 28,
    textAlign: 'center',
    color: '#888',
    fontSize: 13,
    paddingHorizontal: 24,
  },
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  fabIcon: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    lineHeight: 30,
  },
});
