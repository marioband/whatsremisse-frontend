import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView } from 'react-native';

import { ProviderServiceCard } from '../components/ProviderServiceCard';
import { useAuth } from '../context/AuthContext';
import { useMockStore } from '../context/MockStoreContext';
import { Alert } from '../lib/alert';
import { isVisibleAsProvider } from '../lib/visibility';
import { RootStackParamList } from '../navigation/RootNavigator';
import { ServiceAlert } from '../types';

type HomeNav = StackNavigationProp<
  RootStackParamList,
  'Chat' | 'ApplicantsScreen' | 'CreateService' | 'Settings'
>;

const DARK_BG = '#2D2D2D';
const BLUE = '#3F51B5';
const LIGHT_BG = '#F0F2F5';

type StatusFilter = 'Todos' | 'En proceso' | 'Reservas' | 'Finalizados';

const STATUS_FILTERS: StatusFilter[] = ['Todos', 'En proceso', 'Reservas', 'Finalizados'];

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

const getScheduledAt = (service: ServiceAlert): Date | null => {
  if (service.scheduled_at) return new Date(service.scheduled_at);
  return null;
};

const isReservation = (service: ServiceAlert): boolean => {
  const scheduled = getScheduledAt(service);
  if (!scheduled) return false;
  return scheduled.getTime() > Date.now() + TWO_HOURS_MS;
};

const isExpired = (service: ServiceAlert): boolean => {
  const scheduled = getScheduledAt(service);
  if (!scheduled) return false;
  return scheduled.getTime() < Date.now();
};

const isGraceExpired = (service: ServiceAlert): boolean => {
  const scheduled = getScheduledAt(service);
  if (!scheduled) return false;
  return Date.now() - scheduled.getTime() > TWENTY_FOUR_HOURS_MS;
};

const getGraceCountdown = (service: ServiceAlert): string => {
  const scheduled = getScheduledAt(service);
  if (!scheduled) return '';
  const remaining = TWENTY_FOUR_HOURS_MS - (Date.now() - scheduled.getTime());
  if (remaining <= 0) return 'Eliminando...';
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}h ${minutes}m`;
};

const getServiceStatusText = (service: ServiceAlert): string => {
  const step = service.driver_progress_step ?? 0;
  if (step === 0) return 'Proceso del servicio: conductor en camino';
  if (step === 1) return 'Proceso del servicio: conductor ubicado';
  if (step === 2) return 'Proceso del servicio: en proceso';
  if (step >= 3) return 'Proceso del servicio: finalizado';
  return 'Proceso del servicio: en camino';
};

export function ProviderHomeScreen() {
  const navigation = useNavigation<HomeNav>();
  const { session } = useAuth();
  const { services, applications, archiveService } = useMockStore();

  const [activeStatus, setActiveStatus] = useState<StatusFilter>('Todos');
  const [showArchived, setShowArchived] = useState(false);

  // En este modo solo se ven los servicios que yo publiqué como proveedor; los
  // de otros usuarios (aunque estén abiertos o ya aceptados) no son míos.
  const myProviderServices = useMemo(
    () => services.filter((s) => isVisibleAsProvider(s, session?.user?.id)),
    [services, session?.user?.id]
  );

  // Servicios activos (no archivados) deduplicados por ID, base para contadores y listas
  const activeDedupedServices = useMemo(() => {
    const seen = new Set<string>();
    return myProviderServices.filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return !s.archived;
    });
  }, [myProviderServices]);

  const { enProcesoCount, finalizadosCount } = useMemo(() => {
    const enProceso = activeDedupedServices.filter(
      (s) =>
        s.status === 'STATUS_EN_ROUTE_ORIGIN' ||
        s.status === 'STATUS_AT_ORIGIN' ||
        s.status === 'STATUS_IN_PROGRESS'
    ).length;
    const finalizados = activeDedupedServices.filter(
      (s) => s.status === 'STATUS_COMPLETED' && !isExpired(s)
    ).length;
    return { enProcesoCount: enProceso, finalizadosCount: finalizados };
  }, [activeDedupedServices]);

  const filteredServices = useMemo(() => {
    let result = showArchived
      ? myProviderServices.filter((s) => s.archived)
      : activeDedupedServices;

    // Servicios vencidos pasan a una gracia de 24h; transcurrida esa gracia se ocultan (eliminación lógica)
    result = result.filter((s) => !isExpired(s) || !isGraceExpired(s));

    if (activeStatus === 'En proceso') {
      result = result.filter(
        (s) =>
          s.status === 'STATUS_EN_ROUTE_ORIGIN' ||
          s.status === 'STATUS_AT_ORIGIN' ||
          s.status === 'STATUS_IN_PROGRESS'
      );
    } else if (activeStatus === 'Reservas') {
      result = result.filter((s) => s.status === 'STATUS_OPEN' && isReservation(s));
    } else if (activeStatus === 'Finalizados') {
      result = result.filter((s) => s.status === 'STATUS_COMPLETED' && !isExpired(s));
    }

    return result;
  }, [myProviderServices, activeDedupedServices, activeStatus, showArchived]);

  const handleCardPress = (service: ServiceAlert) => {
    // Servicios vencidos dentro de las 24h de gracia van a edición para reprogramar
    if (isExpired(service) && !isGraceExpired(service)) {
      navigation.navigate('CreateService', { service });
      return;
    }

    const hasDriver = !!service.assigned_driver_id;
    const pendingApplicants = applications.filter(
      (a) => a.serviceId === service.id && a.status === 'PENDING'
    );

    if (hasDriver) {
      navigation.navigate('Chat', {
        serviceId: service.id,
        driverId: service.assigned_driver_id!,
        driverName: 'Conductor',
      });
    } else if (pendingApplicants.length > 0) {
      navigation.navigate('ApplicantsScreen', { serviceId: service.id });
    } else {
      Alert.alert('Sin postulantes', 'No hay postulantes pendientes');
    }
  };

  const handleArchive = (serviceId: string) => {
    archiveService(serviceId);
  };

  const renderProviderCard = ({ item }: { item: ServiceAlert }) => {
    const applicantCount = applications.filter(
      (a) => a.serviceId === item.id && a.status === 'PENDING'
    ).length;

    return (
      <TouchableOpacity
        style={styles.cardWrapper}
        onPress={() => handleCardPress(item)}
        activeOpacity={0.95}
      >
        <ProviderServiceCard service={item} onArchive={() => handleArchive(item.id)} />

        {/* Franja de estado: vencido toma precedencia */}
        {isExpired(item) && !isGraceExpired(item) ? (
          <View style={styles.expiredBar}>
            <Text style={styles.expiredText}>Servicio vencido</Text>
            <Text style={styles.expiredCountdown}>Se elimina en: {getGraceCountdown(item)}</Text>
          </View>
        ) : (
          <>
            {item.status === 'STATUS_OPEN' && (
              <View style={styles.footerCenter}>
                <Text style={styles.footerText}>Buscando conductores</Text>
              </View>
            )}

            {/* Cualquier postulación pendiente muestra la tarjeta: el conductor
                que postula no cambia el estado del servicio en la base. */}
            {applicantCount > 0 && !item.assigned_driver_id && (
              <TouchableOpacity
                style={styles.applicantsButton}
                onPress={() => navigation.navigate('ApplicantsScreen', { serviceId: item.id })}
              >
                <Text style={styles.applicantsButtonText}>({applicantCount}) Postulantes</Text>
              </TouchableOpacity>
            )}

            {(item.status === 'STATUS_EN_ROUTE_ORIGIN' ||
              item.status === 'STATUS_AT_ORIGIN' ||
              item.status === 'STATUS_IN_PROGRESS' ||
              item.status === 'STATUS_COMPLETED') && (
              <View style={styles.progressBar}>
                <Text style={styles.progressText}>{getServiceStatusText(item)}</Text>
              </View>
            )}
          </>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Secondary filters */}
      <View style={styles.filterBar}>
        <View style={styles.statusPills}>
          {STATUS_FILTERS.map((status) => {
            const count =
              status === 'En proceso'
                ? enProcesoCount
                : status === 'Finalizados'
                  ? finalizadosCount
                  : 0;
            return (
              <TouchableOpacity
                key={status}
                style={[styles.statusPill, activeStatus === status && styles.statusPillActive]}
                onPress={() => setActiveStatus(status)}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    activeStatus === status && styles.statusPillTextActive,
                  ]}
                >
                  {status}
                </Text>
                {(status === 'En proceso' || status === 'Finalizados') && count > 0 && (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{count > 99 ? '99+' : count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity style={styles.filterBtn}>
          <Text style={styles.filterIcon}>▼</Text>
        </TouchableOpacity>
      </View>

      {/* Archived link */}
      <TouchableOpacity style={styles.archivedLink} onPress={() => setShowArchived((v) => !v)}>
        <Text style={styles.archivedText}>{showArchived ? 'Ver activos' : 'Archivados'}</Text>
      </TouchableOpacity>

      {/* List */}
      <FlatList
        data={filteredServices}
        keyExtractor={(item) => item.id}
        renderItem={renderProviderCard}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {showArchived ? 'No hay servicios archivados' : 'No hay servicios disponibles'}
          </Text>
        }
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('CreateService')}>
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LIGHT_BG,
  },
  filterBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ddd',
  },
  statusPills: {
    flexDirection: 'row',
  },
  statusPill: {
    position: 'relative',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f0f2f5',
    marginRight: 6,
  },
  statusPillActive: {
    backgroundColor: BLUE,
  },
  statusPillText: {
    fontSize: 12,
    color: '#555',
    fontWeight: '600',
  },
  statusPillTextActive: {
    color: '#fff',
  },
  tabBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#9B3B43',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#fff',
  },
  tabBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  filterBtn: {
    padding: 8,
    backgroundColor: '#f0f2f5',
    borderRadius: 8,
  },
  filterIcon: {
    fontSize: 14,
  },
  archivedLink: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  archivedText: {
    color: BLUE,
    fontWeight: '600',
    fontSize: 13,
  },
  list: {
    paddingTop: 12,
    paddingBottom: 90,
  },
  cardWrapper: {
    marginBottom: 12,
  },
  footerCenter: {
    backgroundColor: '#f5f5f5',
    marginHorizontal: 12,
    marginTop: -6,
    paddingVertical: 10,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    alignItems: 'center',
  },
  footerText: {
    color: '#666',
    fontSize: 13,
    fontWeight: '600',
  },
  applicantsButton: {
    backgroundColor: BLUE,
    marginHorizontal: 12,
    marginTop: -6,
    paddingVertical: 12,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    alignItems: 'center',
  },
  applicantsButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  progressBar: {
    backgroundColor: DARK_BG,
    marginHorizontal: 12,
    marginTop: -6,
    paddingVertical: 10,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    alignItems: 'center',
  },
  progressText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  expiredBar: {
    backgroundColor: '#9B3B43',
    marginHorizontal: 12,
    marginTop: -6,
    paddingVertical: 10,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    alignItems: 'center',
  },
  expiredText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  expiredCountdown: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 40,
    fontSize: 14,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: DARK_BG,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    zIndex: 100,
  },
  fabIcon: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
});
