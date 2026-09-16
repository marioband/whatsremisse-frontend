import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView } from 'react-native';

import { Fab } from '../components/Fab';
import { ServiceCard } from '../components/ServiceCard';
import { useAuth } from '../context/AuthContext';
import { useMockStore } from '../context/MockStoreContext';
import { useEstimacionesDeRuta } from '../hooks/useEstimacionesDeRuta';
import { usePosicionPublicada } from '../hooks/usePosicionPublicada';
import { Alert } from '../lib/alert';
import { AZUL } from '../lib/colors';
import { esProgramado } from '../lib/datetime';
import { estaPagadoYCerrado, MiPostulacionEnLaTarjeta } from '../lib/estadoServicio';
import { estadoDeMiPostulacion } from '../lib/miPostulacion';
import { esPremium } from '../lib/premium';
import { hayApiDeRutas } from '../lib/routes';
import { isVisibleAsDriver } from '../lib/visibility';
import { RootStackParamList } from '../navigation/RootNavigator';
import { ServiceAlert } from '../types';

type HomeNav = StackNavigationProp<RootStackParamList, 'Chat' | 'Settings'>;

const BLUE = '#3F51B5';
const LIGHT_BG = '#F0F2F5';
const BADGE_RED = '#C2333F';
/** Cuánto se queda a la vista la tarjeta del rechazo recién llegado (3 segundos). */
const VISTA_DE_RECHAZO_MS = 3000;

type StatusFilter = 'Todos' | 'En proceso' | 'Reservas';

const STATUS_FILTERS: StatusFilter[] = ['Todos', 'En proceso', 'Reservas'];

export function DriverHomeScreen() {
  const navigation = useNavigation<HomeNav>();
  const { session, profile } = useAuth();
  const {
    role,
    services,
    applications,
    groups,
    userProfile,
    archiveService,
    unarchiveService,
    applyToService,
    cancelApplication,
    driverDebt,
    debtThreshold,
    emitChatNotification,
  } = useMockStore();

  const [activeStatus, setActiveStatus] = useState<StatusFilter>('Todos');
  const [showArchived, setShowArchived] = useState(false);

  const currentDriverId = session?.user?.id ?? '';

  const getApplication = (serviceId: string) =>
    applications.find(
      (a) => a.serviceId === serviceId && a.driverId === currentDriverId && a.status === 'PENDING'
    );

  const getDriverNotification = (serviceId: string): number => {
    const app = applications.find(
      (a) => a.serviceId === serviceId && a.driverId === currentDriverId && a.status === 'PENDING'
    );
    if (app?.providerChatStarted && !app.seenByDriver) return 1;
    return 0;
  };

  const getDisplayGroupName = (serviceId: string): string | undefined => {
    const groupIds = services.filter((s) => s.id === serviceId).map((s) => s.group_id);
    if (groupIds.length === 0) return undefined;

    const priority: Record<'owner' | 'admin' | 'member', number> = {
      owner: 3,
      admin: 2,
      member: 1,
    };
    let best = groups.find((g) => g.id === groupIds[0]);

    groupIds.forEach((gid) => {
      const g = groups.find((gg) => gg.id === gid);
      if (g && best && priority[g.role] > priority[best.role]) {
        best = g;
      }
    });

    return best?.name;
  };

  const isScheduledService = (service: ServiceAlert) => esProgramado(service);

  /**
   * El servicio ya es MÍO: el proveedor me aceptó (aunque el viaje todavía no arranque)
   * y sigue vivo. Antes solo contaba desde que había movimiento (en camino / en el
   * origen), así que la tarjeta recién aceptada se quedaba en "Todos".
   */
  const esAceptadoMio = (service: ServiceAlert) =>
    service.assigned_driver_id === currentDriverId &&
    service.status !== 'STATUS_COMPLETED' &&
    service.status !== 'STATUS_CANCELLED' &&
    !estaPagadoYCerrado(service);

  const isReserva = (service: ServiceAlert) =>
    esAceptadoMio(service) && isScheduledService(service);
  /** Aceptado pasa a "En proceso" (regla del usuario); las reservas a su apartado. */
  const isEnProceso = (service: ServiceAlert) =>
    (esAceptadoMio(service) && !isScheduledService(service)) ||
    service.status === 'STATUS_IN_PROGRESS';

  const isOpenAndAvailable = (service: ServiceAlert) =>
    service.status === 'STATUS_OPEN' && !service.assigned_driver_id && !getApplication(service.id);

  /**
   * Mi postulación en este servicio, para la franja de la tarjeta: el puesto que
   * ocupo, o el aviso de que quedé fuera. Es la única señal del estado de la
   * tarjeta del conductor.
   */
  const miPostulacionDe = (service: ServiceAlert): MiPostulacionEnLaTarjeta => ({
    estado: estadoDeMiPostulacion(applications, service.id, currentDriverId),
    numero:
      applications.find((a) => a.serviceId === service.id && a.driverId === currentDriverId)
        ?.order ?? null,
  });

  /**
   * Rechazos recién llegados: la tarjeta con el aviso se muestra **3 segundos** y
   * después desaparece de la lista (regla del usuario). Antes se quedaba para siempre.
   *
   * El reloj arranca cuando el conductor PUEDE verla: si el rechazo llega mientras
   * está en el chat, se guarda y se muestran los 3 segundos al volver al inicio.
   */
  const [rechazosVisibles, setRechazosVisibles] = useState<Record<string, number>>({});
  const rechazosYaVistos = useRef<Set<string>>(new Set());
  const rechazosPendientes = useRef<Set<string>>(new Set());
  const inicioConFoco = useRef(false);
  const lineaBaseLista = useRef(false);

  const mostrarRechazos = (ids: string[]) => {
    if (ids.length === 0) return;
    if (!inicioConFoco.current) {
      ids.forEach((id) => rechazosPendientes.current.add(id));
      return;
    }
    const hasta = Date.now() + VISTA_DE_RECHAZO_MS;
    setRechazosVisibles((actuales) => ({
      ...actuales,
      ...Object.fromEntries(ids.map((id) => [id, hasta])),
    }));
  };

  useEffect(() => {
    if (!currentDriverId) return;

    // Volvió a postularse: se olvida el rechazo, así un rechazo posterior sí avisa.
    applications
      .filter((a) => a.driverId === currentDriverId && a.status !== 'REJECTED')
      .forEach((a) => {
        rechazosYaVistos.current.delete(a.serviceId);
        rechazosPendientes.current.delete(a.serviceId);
      });

    const rechazados = applications.filter(
      (a) => a.driverId === currentDriverId && a.status === 'REJECTED'
    );
    if (!lineaBaseLista.current) {
      // Primera lectura: lo que ya estaba rechazado no es noticia de ahora.
      rechazados.forEach((a) => rechazosYaVistos.current.add(a.serviceId));
      if (applications.length > 0) lineaBaseLista.current = true;
      return;
    }

    const nuevos = rechazados.filter((a) => !rechazosYaVistos.current.has(a.serviceId));
    if (nuevos.length === 0) return;
    nuevos.forEach((a) => rechazosYaVistos.current.add(a.serviceId));
    mostrarRechazos(nuevos.map((a) => a.serviceId));
  }, [applications, currentDriverId]);

  /** Al volver al inicio se muestran los rechazos que llegaron mientras estaba fuera. */
  useFocusEffect(
    useCallback(() => {
      inicioConFoco.current = true;
      const pendientes = [...rechazosPendientes.current];
      if (pendientes.length > 0) {
        rechazosPendientes.current.clear();
        const hasta = Date.now() + VISTA_DE_RECHAZO_MS;
        setRechazosVisibles((actuales) => ({
          ...actuales,
          ...Object.fromEntries(pendientes.map((id) => [id, hasta])),
        }));
      }
      return () => {
        inicioConFoco.current = false;
      };
    }, [])
  );

  /** Un solo temporizador: al cumplirse los 3 segundos la tarjeta se va sola. */
  useEffect(() => {
    if (Object.keys(rechazosVisibles).length === 0) return;
    const temporizador = setTimeout(() => {
      setRechazosVisibles((actuales) =>
        Object.fromEntries(Object.entries(actuales).filter(([, hasta]) => hasta > Date.now()))
      );
    }, VISTA_DE_RECHAZO_MS + 120);
    return () => clearTimeout(temporizador);
  }, [rechazosVisibles]);

  /** ¿Todavía toca pintar la tarjeta del rechazo recién llegado? */
  const rechazoReciente = (service: ServiceAlert) =>
    (rechazosVisibles[service.id] ?? 0) > Date.now();

  const driverVehicleType = userProfile?.vehicleType || 'Auto';

  const matchesVehicleType = (service: ServiceAlert) => {
    const required = service.vehicle_requirements?.vehicle_type;
    if (!required || required === 'Todos') return true;
    return required === driverVehicleType;
  };

  const groupIdList = useMemo(() => groups.map((g) => g.id), [groups]);

  const myActiveServices = useMemo(() => {
    // Deduplicación estricta por service_id (anti-spam cuando un proveedor comparte la misma alerta en varios grupos)
    const seen = new Set<string>();
    const filtered = services.filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      if (showArchived) return s.archived;
      if (s.archived) return false;
      if (s.status === 'STATUS_CANCELLED') return false;
      // Pagado y cerrado: el viaje ya se consulta en "Mis servicios" (con su
      // historial de pago), no en el inicio.
      if (estaPagadoYCerrado(s)) return false;
      if (!isVisibleAsDriver(s, currentDriverId, groupIdList) && !rechazoReciente(s)) {
        return false;
      }
      if (!matchesVehicleType(s)) return false;
      return true;
    });
    return filtered;
  }, [services, showArchived, driverVehicleType, currentDriverId, groupIdList, applications]);

  // "Todos": alertas nuevas y postuladas. Lo ya aceptado se fue a "En proceso"
  // (regla del usuario); el rechazo recién llegado se asoma 3 segundos y se va.
  const todosServices = useMemo(
    () =>
      myActiveServices.filter(
        (s) => isOpenAndAvailable(s) || !!getApplication(s.id) || rechazoReciente(s)
      ),
    [myActiveServices, applications, rechazosVisibles]
  );

  // Ordenamiento estricto en "Todos": Aceptados > Postulados > Nuevos
  const sortedServices = useMemo(() => {
    const accepted: ServiceAlert[] = [];
    const applied: ServiceAlert[] = [];
    const news: ServiceAlert[] = [];

    todosServices.forEach((s) => {
      if (esAceptadoMio(s)) accepted.push(s);
      else if (getApplication(s.id)) applied.push(s);
      else news.push(s);
    });

    const sortByDateDesc = (a: ServiceAlert, b: ServiceAlert) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

    return [
      ...accepted.sort(sortByDateDesc),
      ...applied.sort(sortByDateDesc),
      ...news.sort(sortByDateDesc),
    ];
  }, [todosServices, applications]);

  // Contadores para badges
  const enProcesoCount = useMemo(
    () => myActiveServices.filter((s) => isEnProceso(s) && s.status !== 'STATUS_COMPLETED').length,
    [myActiveServices]
  );

  const reservasCount = useMemo(
    () => myActiveServices.filter((s) => isReserva(s)).length,
    [myActiveServices]
  );

  const handleCardPress = (service: ServiceAlert) => {
    const application = getApplication(service.id);
    const notificationCount = getDriverNotification(service.id);

    // Postulado: toque habilitado solo si el proveedor envió mensaje
    if (application) {
      if (notificationCount > 0) {
        navigation.navigate('Chat', {
          serviceId: service.id,
          driverId: currentDriverId,
          driverName: `${userProfile?.firstName || ''} ${userProfile?.lastName || ''}`.trim(),
        });
      }
      return;
    }

    const driverName =
      `${userProfile?.firstName || ''} ${userProfile?.lastName || ''}`.trim() || 'Conductor';

    // Servicio aceptado: abrir el chat. El viaje NO se marca desde la tarjeta:
    // los hitos (Ubicado → En proceso → Finalizado) se reportan con el
    // deslizamiento dentro del chat, y escribir aquí STATUS_IN_PROGRESS
    // significaba reportar el hito 2 ("Servicio en Proceso") de un solo toque,
    // saltándose "Ubicado". La tarjeta aceptada ya aparece en "En proceso"
    // desde que el proveedor acepta.
    if (esAceptadoMio(service)) {
      navigation.navigate('Chat', {
        serviceId: service.id,
        driverId: currentDriverId,
        driverName,
      });
      return;
    }

    // Servicio ya en proceso: solo abrir chat
    if (service.status === 'STATUS_IN_PROGRESS') {
      navigation.navigate('Chat', {
        serviceId: service.id,
        driverId: currentDriverId,
        driverName,
      });
      return;
    }

    // Servicio completado: abrir chat para ver cuadre
    if (service.status === 'STATUS_COMPLETED') {
      navigation.navigate('Chat', {
        serviceId: service.id,
        driverId: currentDriverId,
        driverName,
      });
      return;
    }

    // Alerta nueva disponible
    if (isBlocked) {
      Alert.alert('Postulación bloqueada', 'Tu deuda supera el límite permitido.');
      return;
    }

    applyToService(service.id, currentDriverId);
    emitChatNotification(
      'Nueva postulaci\u00f3n',
      `Un conductor postul\u00f3 al servicio: ${service.title}`,
      { serviceId: service.id, type: 'NEW_APPLICATION' }
    );
  };

  const handleArchive = (serviceId: string) => {
    archiveService(serviceId);
  };

  const handleUnarchive = (serviceId: string) => {
    unarchiveService(serviceId);
  };

  const handleCancelApplication = (serviceId: string) => {
    cancelApplication(serviceId, currentDriverId);
    Alert.alert('Postulación anulada', 'Ya no estás postulado a este servicio.');
  };

  const isDriver = role === 'DRIVER';
  const isBlocked = driverDebt > debtThreshold;

  const displayServices = useMemo(() => {
    if (showArchived) {
      return myActiveServices
        .filter((s) => s.archived)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    if (activeStatus === 'En proceso') {
      // La tarjeta entra aquí en cuanto el PROVEEDOR acepta al conductor (el
      // servicio queda asignado, STATUS_AT_ORIGIN), no cuando el conductor la
      // toca: antes el filtro pedía STATUS_IN_PROGRESS y la tarjeta solo llegaba
      // aquí después de tocarla, mientras el contador de la píldora ya la
      // contaba con isEnProceso().
      return myActiveServices
        .filter((s) => isEnProceso(s) && s.status !== 'STATUS_COMPLETED')
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    if (activeStatus === 'Reservas') {
      return myActiveServices
        .filter((s) => isReserva(s))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return sortedServices;
  }, [sortedServices, myActiveServices, activeStatus, showArchived]);

  // Medidas de distancia y tiempo (función Premium): del conductor al origen y
  // del origen al destino. Sin premium (o sin clave de Google) no se pide nada.
  const premium = esPremium(profile);
  // El conductor publica su última posición (como mucho cada 500 m o 5 minutos)
  // para que el proveedor pueda ver a qué distancia está de su punto de origen.
  usePosicionPublicada(role === 'DRIVER');
  const { estimaciones, avisoDeUbicacion, reintentar } = useEstimacionesDeRuta(
    displayServices,
    premium && hayApiDeRutas()
  );

  const renderBadge = (count: number) => {
    if (count <= 0) return null;
    return (
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Secondary filters */}
      <View style={styles.filterBar}>
        <View style={styles.statusPills}>
          {STATUS_FILTERS.map((status) => {
            const count =
              status === 'En proceso' ? enProcesoCount : status === 'Reservas' ? reservasCount : 0;
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
                {renderBadge(count)}
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

      {/* Debt warning */}
      {isDriver && isBlocked && (
        <View style={styles.debtBanner}>
          <Text style={styles.debtBannerText}>
            ⚠️ Postulación bloqueada: deuda S/ {driverDebt} &gt; límite S/ {debtThreshold}
          </Text>
        </View>
      )}

      {/* Sin ubicación no hay distancia al origen: se explica y se puede reintentar */}
      {premium && avisoDeUbicacion && displayServices.length > 0 && (
        <View style={styles.locationBanner}>
          <Text style={styles.locationBannerText}>📍 {avisoDeUbicacion}</Text>
          <TouchableOpacity onPress={reintentar} style={styles.locationBannerBtn}>
            <Text style={styles.locationBannerBtnText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* List */}
      <FlatList
        data={displayServices}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const application = getApplication(item.id);
          const accepted = esAceptadoMio(item);
          const inEnProceso = activeStatus === 'En proceso';
          const inReservas = activeStatus === 'Reservas';
          const notificationCount = getDriverNotification(item.id);
          const displayGroupName = getDisplayGroupName(item.id);

          return (
            <ServiceCard
              service={{
                ...item,
                origin_estimate: estimaciones[item.id]?.origen || item.origin_estimate,
                destination_estimate: estimaciones[item.id]?.destino || item.destination_estimate,
              }}
              onPress={() => handleCardPress(item)}
              onArchive={() => handleArchive(item.id)}
              onUnarchive={() => handleUnarchive(item.id)}
              onCancelApplication={application ? () => handleCancelApplication(item.id) : undefined}
              showArchived={showArchived}
              disableSwipe={inEnProceso || inReservas || accepted}
              showReservaIndicator={inReservas}
              isApplied={!!application}
              miPostulacion={miPostulacionDe(item)}
              notificationCount={notificationCount}
              groupName={displayGroupName}
            />
          );
        }}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {showArchived ? 'No hay servicios archivados' : 'No hay servicios disponibles'}
          </Text>
        }
      />

      {/* FAB para crear servicio (solo proveedor): flota abajo a la derecha */}
      {role === 'PROVIDER' && (
        <Fab
          color={AZUL}
          etiqueta="Crear servicio"
          onPress={() => navigation.navigate('CreateService')}
        />
      )}
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f0f2f5',
    marginRight: 8,
    position: 'relative',
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
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: BADGE_RED,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
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
  debtBanner: {
    backgroundColor: '#ffebee',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  locationBanner: {
    backgroundColor: '#EEF1FB',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  locationBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#3F51B5',
    marginRight: 10,
  },
  locationBannerBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#3F51B5',
  },
  locationBannerBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  debtBannerText: {
    color: '#C2333F',
    fontSize: 12,
    fontWeight: '600',
  },
  list: {
    paddingTop: 12,
    paddingBottom: 90,
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 40,
    fontSize: 14,
  },
});
