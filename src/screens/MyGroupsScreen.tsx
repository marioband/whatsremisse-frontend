import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView } from 'react-native';

import { Fab } from '../components/Fab';
import { useMockStore, GroupItem } from '../context/MockStoreContext';
import { RootStackParamList } from '../navigation/RootNavigator';

type GroupsNav = StackNavigationProp<
  RootStackParamList,
  'GroupChat' | 'GroupMembers' | 'CreateGroup' | 'Settings'
>;

const DARK_BG = '#2D2D2D';
const LIGHT_BG = '#F0F2F5';

const ROLE_COLORS = {
  owner: '#C0C7E8',
  admin: '#B2E3BF',
  member: '#F2F2F2',
  favorite: '#FFF59E',
};

export function MyGroupsScreen() {
  const navigation = useNavigation<GroupsNav>();
  const { groups, toggleFavoriteGroup } = useMockStore();

  const getCardColor = (group: GroupItem) => {
    if (group.favorite) return ROLE_COLORS.favorite;
    return ROLE_COLORS[group.role];
  };

  const renderGroupCard = ({ item }: { item: GroupItem }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: getCardColor(item) }]}
      activeOpacity={0.9}
      onPress={() => navigation.navigate('GroupChat', { groupId: item.id, groupName: item.name })}
    >
      {/* Avatar */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
      </View>

      {/* Nombre centrado */}
      <Text style={styles.groupName} numberOfLines={1}>
        {item.name}
      </Text>

      {/* Acciones */}
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => toggleFavoriteGroup(item.id)} style={styles.actionBtn}>
          <Text style={styles.heart}>{item.favorite ? '\u2665' : '\u2661'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() =>
            navigation.navigate('GroupMembers', { groupId: item.id, groupName: item.name })
          }
        >
          <Text style={styles.gear}>⚙</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Group list */}
      <FlatList
        data={groups}
        keyExtractor={(item) => item.id}
        renderItem={renderGroupCard}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>No tienes grupos</Text>}
      />

      {/* FAB */}
      <Fab etiqueta="Agregar grupo" onPress={() => navigation.navigate('CreateGroup')} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LIGHT_BG,
  },
  list: {
    padding: 12,
    paddingBottom: 100,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: DARK_BG,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  groupName: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    marginHorizontal: 12,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    padding: 8,
    marginLeft: 4,
  },
  heart: {
    fontSize: 20,
    color: '#E91E63',
  },
  gear: {
    fontSize: 20,
    color: '#555',
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 40,
  },
});
