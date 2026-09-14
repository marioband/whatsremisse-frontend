import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  Image,
} from 'react-native';

import { useMockStore } from '../context/MockStoreContext';
import { RootStackParamList } from '../navigation/RootNavigator';

type ApplicantsNav = StackNavigationProp<RootStackParamList, 'ApplicantsScreen' | 'Settings'>;
type ApplicantsRoute = RouteProp<RootStackParamList, 'ApplicantsScreen'>;

const DARK_BG = '#2D2D2D';
const BLUE = '#3F51B5';

interface DriverProfile {
  id: string;
  firstName: string;
  lastName: string;
  dni: string;
  phone: string;
  brand: string;
  model: string;
  color: string;
  plate: string;
  photoUrl?: string;
}

const emptyDriverProfile = (driverId: string): DriverProfile => ({
  id: driverId,
  firstName: 'Conductor',
  lastName: '',
  dni: '-',
  phone: '-',
  brand: '-',
  model: '-',
  color: '-',
  plate: '-',
  photoUrl: undefined,
});

export function ApplicantsScreen() {
  const navigation = useNavigation<ApplicantsNav>();
  const route = useRoute<ApplicantsRoute>();
  const { serviceId } = route.params;
  const { applications, approveApplication, rejectApplication, services, emitChatNotification } =
    useMockStore();

  const serviceApplicants = useMemo(
    () =>
      applications
        .filter((a) => a.serviceId === serviceId && a.status === 'PENDING')
        .sort((a, b) => a.order - b.order),
    [applications, serviceId]
  );

  const handleSelect = (serviceId: string, driverId: string) => {
    approveApplication(serviceId, driverId);
    const svc = services.find((s) => s.id === serviceId);
    emitChatNotification(
      '\u00a1Postulaci\u00f3n aceptada!',
      `Fuiste seleccionado para el servicio: ${svc?.title || serviceId}. El chat ya est\u00e1 disponible.`,
      { serviceId, driverId, type: 'APPLICATION_ACCEPTED' }
    );
    navigation.goBack();
  };

  const handleReject = (id: string) => {
    rejectApplication(id);
  };

  const handleChat = (applicantServiceId: string, applicantDriverId: string, name: string) => {
    navigation.navigate('Chat', {
      serviceId: applicantServiceId,
      driverId: applicantDriverId,
      driverName: name,
    });
  };

  const getProfile = (driverId: string) => emptyDriverProfile(driverId);

  const renderApplicant = ({
    item,
  }: {
    item: { serviceId: string; driverId: string; status: string };
  }) => {
    const profile = getProfile(item.driverId);

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.95}
        onPress={() =>
          handleChat(item.serviceId, item.driverId, `${profile.firstName} ${profile.lastName}`)
        }
      >
        {/* Top row: avatar, driver data */}
        <View style={styles.topRow}>
          {profile.photoUrl ? (
            <Image source={{ uri: profile.photoUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{profile.firstName.charAt(0)}</Text>
            </View>
          )}

          <View style={styles.driverSection}>
            <Text style={styles.sectionTitle}>Datos del conductor</Text>
            <View style={styles.fieldRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.fieldText}>Nombres: {profile.firstName}</Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.fieldText}>Apellidos: {profile.lastName}</Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.fieldText}>DNI: {profile.dni}</Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.fieldText}>Celular: {profile.phone}</Text>
            </View>
          </View>
        </View>

        {/* Separator */}
        <View style={styles.separator} />

        {/* Vehicle data */}
        <View style={styles.vehicleSection}>
          <Text style={styles.sectionTitle}>Datos del vehículo</Text>
          <View style={styles.vehicleGrid}>
            <View style={styles.vehicleItem}>
              <Text style={styles.vehicleLabel}>Marca</Text>
              <Text style={styles.vehicleValue}>{profile.brand}</Text>
            </View>
            <View style={styles.vehicleItem}>
              <Text style={styles.vehicleLabel}>Modelo</Text>
              <Text style={styles.vehicleValue}>{profile.model}</Text>
            </View>
            <View style={styles.vehicleItem}>
              <Text style={styles.vehicleLabel}>Color</Text>
              <Text style={styles.vehicleValue}>{profile.color}</Text>
            </View>
            <View style={styles.vehicleItem}>
              <Text style={styles.vehicleLabel}>Placa</Text>
              <Text style={styles.vehicleValue}>{profile.plate}</Text>
            </View>
          </View>
        </View>

        {/* Bottom actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.selectBtn]}
            onPress={() => handleSelect(item.serviceId, item.driverId)}
          >
            <Text style={styles.actionBtnText}>Seleccionar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={() => handleReject(item.serviceId)}
          >
            <Text style={styles.actionBtnText}>Rechazar</Text>
          </TouchableOpacity>
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
        <Text style={styles.headerTitle}>Postulantes</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.iconBtn}>
            <Text style={styles.icon}>⌕</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Settings')}>
            <Text style={styles.icon}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={serviceApplicants}
        keyExtractor={(item) => `${item.serviceId}-${item.driverId}`}
        renderItem={renderApplicant}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>No hay postulantes pendientes.</Text>}
      />
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
  headerIcons: {
    flexDirection: 'row',
  },
  iconBtn: {
    marginLeft: 12,
    padding: 4,
  },
  icon: {
    color: '#fff',
    fontSize: 20,
  },
  list: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#F2F2F2',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: DARK_BG,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 4,
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  driverSection: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 8,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  bullet: {
    fontSize: 14,
    color: BLUE,
    marginRight: 6,
  },
  fieldText: {
    fontSize: 13,
    color: '#444',
  },
  chatBtn: {
    backgroundColor: BLUE,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginLeft: 8,
  },
  chatBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  separator: {
    height: 1,
    backgroundColor: '#ddd',
    marginVertical: 14,
  },
  vehicleSection: {
    marginBottom: 12,
  },
  vehicleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  vehicleItem: {
    width: '50%',
    marginBottom: 8,
  },
  vehicleLabel: {
    fontSize: 12,
    color: '#888',
  },
  vehicleValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  selectBtn: {
    backgroundColor: BLUE,
    marginRight: 8,
  },
  rejectBtn: {
    backgroundColor: '#ff3b30',
    marginLeft: 8,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 40,
  },
});
