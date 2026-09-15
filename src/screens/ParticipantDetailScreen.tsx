import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';

import { useMockStore } from '../context/MockStoreContext';
import { Alert } from '../lib/alert';
import { fetchProfileById, PublicProfile } from '../lib/database';
import { RootStackParamList } from '../navigation/RootNavigator';

type DetailNav = StackNavigationProp<RootStackParamList, 'ParticipantDetail'>;
type DetailRoute = RouteProp<RootStackParamList, 'ParticipantDetail'>;

const DARK_BG = '#2D2D2D';
const BLUE = '#3F51B5';

function parseName(fullName: string | null): { firstName: string; lastName: string } {
  if (!fullName) return { firstName: '', lastName: '' };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

export function ParticipantDetailScreen() {
  const navigation = useNavigation<DetailNav>();
  const route = useRoute<DetailRoute>();
  const { groupId, memberId, memberName, memberRole } = route.params;
  const { role, members, updateMemberRole, removeMember } = useMockStore();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetchProfileById(memberId)
      .then((data) => {
        if (mounted) setProfile(data);
      })
      .catch((err) => {
        console.error('[ParticipantDetail] fetchProfileById error:', err);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [memberId]);

  const viewerGroupRole: 'owner' | 'admin' | 'member' =
    role === 'GROUP_OWNER' ? 'owner' : role === 'ADMIN' ? 'admin' : 'member';

  const member = members[groupId]?.find((m) => m.id === memberId);
  const currentMemberRole = member?.role || memberRole;

  const { firstName, lastName } = parseName(profile?.full_name || memberName);
  const vehicle = (profile?.vehicle_data || {}) as Record<string, string>;

  const handleToggleAdmin = () => {
    const newRole = currentMemberRole === 'admin' ? 'member' : 'admin';
    updateMemberRole(groupId, memberId, newRole);
    Alert.alert(
      'Rol actualizado',
      `${memberName} ahora es ${newRole === 'admin' ? 'Administrador' : 'Integrante'}.`
    );
  };

  const handleDelete = () => {
    Alert.alert('Eliminar integrante', `\u00bfSeguro que deseas eliminar a ${memberName}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          removeMember(groupId, memberId);
          navigation.goBack();
        },
      },
    ]);
  };

  const renderRow = (label: string, value: string) => (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valuePill}>
        <Text style={styles.valueText}>{value || '-'}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {memberName}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={DARK_BG} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{memberName.charAt(0)}</Text>
            </View>
          </View>

          {/* Driver data */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Datos del conductor</Text>
            {renderRow('Nombres', firstName)}
            {renderRow('Apellidos', lastName)}
            {renderRow('N\u00famero Celular', profile?.phone || '')}
            {renderRow('Rol', profile?.role || '')}
          </View>

          {/* Vehicle data */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Datos del Veh\u00edculo</Text>
            {renderRow('Marca', vehicle.brand || '')}
            {renderRow('Modelo', vehicle.model || '')}
            {renderRow('A\u00f1o', vehicle.year || '')}
            {renderRow('Color', vehicle.color || '')}
            {renderRow('Placa', vehicle.plate || '')}
          </View>

          <View style={styles.spacer} />
        </ScrollView>
      )}

      {/* Bottom actions */}
      <View style={styles.footer}>
        {viewerGroupRole === 'owner' && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.adminBtn]}
              onPress={handleToggleAdmin}
            >
              <Text style={styles.actionBtnText}>
                {currentMemberRole === 'admin' ? 'Quitar Administrador' : 'Administrador'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={handleDelete}>
              <Text style={styles.actionBtnText}>Eliminar</Text>
            </TouchableOpacity>
          </View>
        )}

        {viewerGroupRole === 'admin' && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.deleteBtn, styles.centeredBtn]}
            onPress={handleDelete}
          >
            <Text style={styles.actionBtnText}>Eliminar</Text>
          </TouchableOpacity>
        )}
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
    marginHorizontal: 12,
  },
  headerSpacer: {
    width: 28,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    padding: 20,
    paddingBottom: 40,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatar: {
    width: 140,
    height: 140,
    borderRadius: 20,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: DARK_BG,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  label: {
    width: 110,
    fontSize: 14,
    color: '#555',
    fontWeight: '500',
  },
  valuePill: {
    flex: 1,
    backgroundColor: '#F2F2F2',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  valueText: {
    fontSize: 14,
    color: '#333',
  },
  spacer: {
    height: 20,
  },
  footer: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderTopWidth: 0.5,
    borderTopColor: '#ddd',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  actionBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  adminBtn: {
    backgroundColor: BLUE,
  },
  deleteBtn: {
    backgroundColor: DARK_BG,
  },
  centeredBtn: {
    alignSelf: 'center',
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
