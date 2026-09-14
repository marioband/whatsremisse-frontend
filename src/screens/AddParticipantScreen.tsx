import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';

import { useMockStore } from '../context/MockStoreContext';
import { searchProfilesByPhone } from '../lib/database';
import { RootStackParamList } from '../navigation/RootNavigator';

type AddNav = StackNavigationProp<RootStackParamList, 'AddParticipant'>;
type AddRoute = RouteProp<RootStackParamList, 'AddParticipant'>;

const DARK_BG = '#2D2D2D';
const BLUE = '#3F51B5';

interface SearchableContact {
  id: string;
  name: string;
  phone: string;
  role: string;
}

export function AddParticipantScreen() {
  const navigation = useNavigation<AddNav>();
  const route = useRoute<AddRoute>();
  const { groupId } = route.params;
  const { members, addMember } = useMockStore();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchableContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const existingMemberIds = useMemo(
    () => new Set((members[groupId] || []).map((m) => m.id)),
    [members, groupId]
  );

  useEffect(() => {
    let mounted = true;
    const text = query.trim();
    if (text.length < 3) {
      setResults([]);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      searchProfilesByPhone(text)
        .then((profiles) => {
          if (!mounted) return;
          setResults(
            profiles.map((p) => ({
              id: p.id,
              name: p.full_name || p.phone || 'Sin nombre',
              phone: p.phone || '',
              role: p.role || '',
            }))
          );
        })
        .catch((err) => {
          console.error('[AddParticipant] searchProfilesByPhone error:', err);
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    }, 400);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [query]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = () => {
    selectedIds.forEach((id) => {
      const contact = results.find((c) => c.id === id);
      if (contact && !existingMemberIds.has(contact.id)) {
        addMember({
          id: contact.id,
          groupId,
          name: contact.name,
          role: 'member',
        });
      }
    });
    navigation.goBack();
  };

  const renderContact = ({ item }: { item: SearchableContact }) => {
    const selected = selectedIds.has(item.id);
    const alreadyMember = existingMemberIds.has(item.id);

    return (
      <TouchableOpacity
        style={[styles.contactPill, alreadyMember && styles.disabledPill]}
        onPress={() => !alreadyMember && toggleSelection(item.id)}
        activeOpacity={alreadyMember ? 1 : 0.7}
      >
        <View style={styles.leftContent}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
          </View>
          <View>
            <Text style={[styles.contactName, alreadyMember && styles.disabledText]}>
              {item.name}
            </Text>
            <Text style={styles.phoneText}>{item.phone}</Text>
            {alreadyMember && <Text style={styles.alreadyText}>Ya es integrante</Text>}
          </View>
        </View>

        {!alreadyMember && (
          <View style={[styles.selector, selected && styles.selectorActive]}>
            {selected && <Text style={styles.check}>✓</Text>}
          </View>
        )}
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
        <Text style={styles.headerTitle}>Añadir participante</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchPill}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por teléfono"
            placeholderTextColor="#999"
            value={query}
            onChangeText={setQuery}
            keyboardType="phone-pad"
            autoCapitalize="none"
          />
        </View>
      </View>

      {loading && <ActivityIndicator style={styles.loader} size="small" color={BLUE} />}

      {/* Contact list */}
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={renderContact}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          query.length >= 3 && !loading ? (
            <Text style={styles.emptyText}>No se encontraron usuarios</Text>
          ) : (
            <Text style={styles.emptyText}>Escribe al menos 3 dígitos del teléfono</Text>
          )
        }
      />

      {/* Add button */}
      {selectedIds.size > 0 && (
        <TouchableOpacity style={styles.addButton} onPress={handleAdd}>
          <Text style={styles.addButtonText}>Añadir ({selectedIds.size})</Text>
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
  searchContainer: {
    padding: 16,
    backgroundColor: '#fff',
  },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F2',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchIcon: {
    fontSize: 18,
    color: '#666',
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    paddingVertical: 4,
  },
  loader: {
    marginTop: 12,
  },
  list: {
    padding: 16,
    paddingTop: 0,
    paddingBottom: 100,
  },
  contactPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F2F2F2',
    borderRadius: 30,
    padding: 12,
    paddingHorizontal: 16,
    marginVertical: 8,
  },
  disabledPill: {
    opacity: 0.6,
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
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
  contactName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },
  phoneText: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  disabledText: {
    color: '#777',
  },
  alreadyText: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
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
  addButton: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 24,
    backgroundColor: BLUE,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
