import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';

import { useAuth } from '../context/AuthContext';
import { esPropietarioDelGrupo, rolEnGrupo, useMockStore } from '../context/MockStoreContext';
import { Alert } from '../lib/alert';
import { fetchPublicProfile, PublicProfile } from '../lib/database';
import {
  displayName,
  groupRoleBadgeLabel,
  initialOf,
  memberRoleLabel,
  roleLabel,
} from '../lib/names';
import { textoDeUnidades } from '../lib/unidades';
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

/** Todo valor de `vehicle_data` es JSONB: puede venir número, null o no venir. */
function textOf(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function ParticipantDetailScreen() {
  const navigation = useNavigation<DetailNav>();
  const route = useRoute<DetailRoute>();
  const { groupId, memberId, memberName, memberRole } = route.params;
  const { role, groups, members, updateMemberRole, removeMember } = useMockStore();
  const { session } = useAuth();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [profileFound, setProfileFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // El integrante ya está en el store (nombre, teléfono y vehículo que trajo la
  // lista). Se usa como respaldo para no dejar la ficha en blanco si la lectura
  // individual falla, y para mostrar el nombre cuando Supabase no lo devuelve.
  const member = members[groupId]?.find((m) => m.id === memberId);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchPublicProfile(memberId);
      setProfile(result.profile);
      setProfileFound(result.found);
      setLoadError(result.error);
    } catch (err) {
      setProfile(null);
      setProfileFound(false);
      setLoadError(String(err));
      // eslint-disable-next-line no-console
      console.error('[ParticipantDetail] fetchPublicProfile error:', err);
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const fallbackRole: 'owner' | 'admin' | 'member' =
    role === 'GROUP_OWNER' ? 'owner' : role === 'ADMIN' ? 'admin' : 'member';
  const viewerGroupRole = rolEnGrupo(groups, groupId, session?.user?.id, fallbackRole);

  const currentMemberRole = member?.role || memberRole;

  // El creador del grupo no se degrada ni se elimina: si queda como 'member' o
  // 'admin', la política RLS de group_members ya no le deja agregar integrantes.
  const esElPropietario =
    esPropietarioDelGrupo(groups, members, groupId, memberId) || currentMemberRole === 'owner';

  // Nunca mostrar un UUID donde va un nombre: perfil -> lista de integrantes ->
  // parámetro de navegación -> texto genérico.
  const shownName = displayName([profile?.full_name, member?.name, memberName]);
  const { firstName, lastName } = parseName(profile?.full_name || shownName);

  const phone = textOf(profile?.phone) || textOf(member?.phone);
  const profileRole = profile?.role || member?.profileRole || '';

  const vehicle = (profile?.vehicle_data || member?.vehicleData || {}) as Record<string, unknown>;
  const vehicleRows: [string, string][] = [
    ['Tipo', textoDeUnidades(vehicle.vehicle_type)],
    ['Marca', textOf(vehicle.brand)],
    ['Modelo', textOf(vehicle.model)],
    ['Año', textOf(vehicle.year)],
    ['Color', textOf(vehicle.color)],
    ['Placa', textOf(vehicle.plate)],
  ];
  const tieneVehiculo = vehicleRows.some(([, value]) => value.length > 0);
  const dni = textOf(vehicle.dni);

  const handleToggleAdmin = () => {
    if (esElPropietario) {
      Alert.alert(
        'No permitido',
        'El propietario del grupo no se puede cambiar de rol: es quien puede agregar integrantes.'
      );
      return;
    }
    const newRole = currentMemberRole === 'admin' ? 'member' : 'admin';
    updateMemberRole(groupId, memberId, newRole);
    Alert.alert(
      'Rol actualizado',
      `${shownName} ahora es ${newRole === 'admin' ? 'Administrador' : 'Integrante'}.`
    );
  };

  const handleDelete = () => {
    if (esElPropietario) {
      Alert.alert('No permitido', 'No puedes eliminar al propietario.');
      return;
    }
    Alert.alert('Eliminar integrante', `¿Seguro que deseas eliminar a ${shownName}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          // Solo se vuelve atrás si la base confirmó el borrado; si lo rechaza,
          // el aviso con el motivo se muestra y el integrante sigue en la lista.
          const borrado = await removeMember(groupId, memberId);
          if (borrado) navigation.goBack();
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
          {shownName}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={DARK_BG} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {/* Avatar + rol dentro del grupo */}
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initialOf(shownName)}</Text>
            </View>
            {groupRoleBadgeLabel(currentMemberRole) ? (
              <Text style={styles.groupRoleBadge}>{memberRoleLabel(currentMemberRole)}</Text>
            ) : null}
          </View>

          {/* Diagnóstico: antes la pantalla salía vacía sin decir por qué. */}
          {loadError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>No se pudieron leer los datos del integrante</Text>
              <Text style={styles.errorText}>{loadError}</Text>
              <Text style={styles.errorHint}>
                Es el error que devolvió Supabase. Si dice que la función no existe, falta aplicar
                la migración 0005 (public_profile) en el SQL Editor.
              </Text>
              <TouchableOpacity style={styles.retryBtn} onPress={loadProfile}>
                <Text style={styles.retryText}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          ) : !profileFound ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>Sin datos de este integrante</Text>
              <Text style={styles.errorText}>
                Supabase no devolvió la ficha de este integrante. O bien todavía no completó su
                perfil en la app (nombre, teléfono y vehículo se guardan al completar el perfil), o
                falta aplicar la migración 0005 para autorizar la lectura entre integrantes del
                grupo.
              </Text>
              <TouchableOpacity style={styles.retryBtn} onPress={loadProfile}>
                <Text style={styles.retryText}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Driver data */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Datos del conductor</Text>
            {renderRow('Nombres', firstName)}
            {renderRow('Apellidos', lastName)}
            {renderRow('DNI', dni)}
            {renderRow('Número Celular', phone)}
            {renderRow('Rol', roleLabel(profileRole))}
          </View>

          {/* Vehicle data */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Datos del Vehículo</Text>
            {tieneVehiculo ? (
              vehicleRows.map(([label, value]) => (
                <View key={label}>{renderRow(label, value)}</View>
              ))
            ) : (
              <Text style={styles.sectionNote}>
                Este integrante todavía no registró los datos de su vehículo. Se guardan cuando
                completa su perfil en la app.
              </Text>
            )}
          </View>

          <View style={styles.spacer} />
        </ScrollView>
      )}

      {/* Bottom actions */}
      <View style={styles.footer}>
        {esElPropietario && (
          <Text style={styles.ownerNote}>Propietario del grupo (no se puede cambiar)</Text>
        )}

        {viewerGroupRole === 'owner' && !esElPropietario && (
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

        {viewerGroupRole === 'admin' && !esElPropietario && (
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
  ownerNote: {
    textAlign: 'center',
    color: '#777',
    fontSize: 13,
    marginBottom: 10,
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
  groupRoleBadge: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
    color: BLUE,
  },
  errorBox: {
    backgroundColor: '#FDECEA',
    borderColor: '#C2333F',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 24,
  },
  errorTitle: {
    color: '#C2333F',
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 6,
  },
  errorText: {
    color: '#7F1D1D',
    fontSize: 12,
    lineHeight: 17,
  },
  errorHint: {
    color: '#7F1D1D',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: DARK_BG,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 18,
    marginTop: 12,
  },
  retryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
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
  sectionNote: {
    fontSize: 13,
    color: '#777',
    lineHeight: 18,
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
