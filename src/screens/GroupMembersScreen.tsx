import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  Alert,
} from 'react-native';

import { useMockStore, GroupMember } from '../context/MockStoreContext';
import { RootStackParamList } from '../navigation/RootNavigator';

type MembersNav = StackNavigationProp<RootStackParamList, 'GroupMembers'>;
type MembersRoute = RouteProp<RootStackParamList, 'GroupMembers'>;

const DARK_BG = '#2D2D2D';

export function GroupMembersScreen() {
  const navigation = useNavigation<MembersNav>();
  const route = useRoute<MembersRoute>();
  const { groupId, groupName } = route.params;
  const { role, members, updateMemberRole, removeMember, loadGroupMembers } = useMockStore();

  // Simula el rol del viewer dentro del grupo. Para la prueba inicial se usa el rol global.
  const viewerGroupRole: 'owner' | 'admin' | 'member' =
    role === 'GROUP_OWNER' ? 'owner' : role === 'ADMIN' ? 'admin' : 'member';

  useEffect(() => {
    loadGroupMembers(groupId);
  }, [groupId, loadGroupMembers]);

  const groupMembers = useMemo(() => members[groupId] || [], [members, groupId]);

  const handlePress = (member: GroupMember) => {
    navigation.navigate('ParticipantDetail', {
      groupId,
      memberId: member.id,
      memberName: member.name,
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

  const renderMember = ({ item }: { item: GroupMember }) => (
    <TouchableOpacity
      style={styles.memberPill}
      onPress={() => handlePress(item)}
      onLongPress={() => handleLongPress(item.id, item.name, item.role)}
      activeOpacity={0.8}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
      </View>
      <Text style={styles.memberName} numberOfLines={1}>
        {item.name}
      </Text>
    </TouchableOpacity>
  );

  const canAddMembers = viewerGroupRole === 'owner' || viewerGroupRole === 'admin';

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
      />

      {/* FAB */}
      {canAddMembers && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('AddParticipant', { groupId, groupName })}
        >
          <Text style={styles.fabIcon}>+</Text>
        </TouchableOpacity>
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
  memberName: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 40,
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
