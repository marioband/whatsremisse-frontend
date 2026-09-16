import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView } from 'react-native';

import { EstadoServicioBar } from '../components/EstadoServicioBar';
import { Fab } from '../components/Fab';
import { ProviderServiceCard } from '../components/ProviderServiceCard';
import { useAuth } from '../context/AuthContext';
import { useMockStore } from '../context/MockStoreContext';
import { destinoDeLaTarjetaDelProveedor } from '../lib/accionDeLaTarjeta';
import { cierreDeLaAlerta, estaPagadoYCerrado, estaVencido } from '../lib/estadoServicio';
import { estaCompartido } from '../lib/gruposDeServicio';
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

/**
 * Una alerta se cierra sola a los 20 minutos (al momento) o a los 10 (con hora
 * específica): de ahí en adelante el proveedor la ve como vencida y tiene 24 horas
 * para editarla y reenviarla antes de que desaparezca. La regla vive en
 * `estadoServicio` (`cierreDeLaAlerta`), aquí solo se consulta.
 */
const isExpired = (service: ServiceAlert): boolean => estaVencido(service);

const isGraceExpired = (service: ServiceAlert): boolean =>
  Date.now() - cierreDeLaAlerta(service) > TWENTY_FOUR_HOURS_MS;

const getGraceCountdown = (service: ServiceAlert): string => {
  const remaining = TWENTY_FOUR_HOURS_MS - (Date.now() - cierreDeLaAlerta(service));
  if (remaining <= 0) return 'Eliminando...';
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}h ${minutes}m`;
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
      if (s.archived) return false;
      // Pagado y cerrado: ya vive en "Mis servicios" con su historial de pago, así
      // que no se lista en el inicio (ni en "Todos" ni en "Finalizados").
      if (estaPagadoYCerrado(s)) return false;
      return true;
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
    const postulantesPendientes = applications.filter(
      (a) => a.serviceId === service.id && a.status === 'PENDING'
    ).length;

    // La decisión (y su ORDEN) vive en `lib/accionDeLaTarjeta`: el caso reportado por
    // el usuario fallaba justo por el orden — una alerta con hora específica ya
    // pasada caía en "vencida en gracia" y abría el editor aunque el viaje estuviera
    // en curso con conductor asignado.
    const destino = destinoDeLaTarjetaDelProveedor({
      tieneConductor: !!service.assigned_driver_id,
      compartido: estaCompartido(service),
      vencidaEnGracia: isExpired(service) && !isGraceExpired(service),
      postulantesPendientes,
    });

    if (destino === 'CHAT') {
      navigation.navigate('Chat', {
        serviceId: service.id,
        driverId: service.assigned_driver_id!,
        driverName: 'Conductor',
      });
      return;
    }

    if (destino === 'POSTULANTES') {
      navigation.navigate('ApplicantsScreen', { serviceId: service.id });
      return;
    }

    // Editar el servicio completo, como si se lanzara de nuevo: tarjeta sin compartir,
    // vencida dentro de la gracia, o —el otro caso reportado— compartida y SIN ningún
    // postulante (antes solo salía el aviso "Sin postulantes" y no dejaba hacer nada).
    navigation.navigate('CreateService', { service });
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

        {/* Franja de estado: una sola señal, la que devuelve estadoDeServicio */}
        <View style={styles.cardFooter}>
          <EstadoServicioBar
            service={item}
            postulantes={applicantCount}
            radius={16}
            detalle={
              isExpired(item) && !isGraceExpired(item)
                ? `${applicantCount > 0 ? `${applicantCount} postulante${applicantCount === 1 ? '' : 's'} · ` : ''}se elimina en ${getGraceCountdown(item)}`
                : undefined
            }
          />
        </View>
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
      <Fab etiqueta="Crear servicio" onPress={() => navigation.navigate('CreateService')} />
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
    backgroundColor: '#C2333F',
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
  cardFooter: {
    marginHorizontal: 12,
    marginTop: -6,
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
    backgroundColor: '#C2333F',
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
});
