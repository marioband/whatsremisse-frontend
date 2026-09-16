import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { useMockStore } from '../context/MockStoreContext';
import { AZUL, OSCURO, VERDE_ACCION } from '../lib/colors';
import { estadoDeServicio } from '../lib/estadoServicio';
import { historialDePago } from '../lib/pagoServicio';
import { RootStackParamList } from '../navigation/RootNavigator';
import { ServiceAlert } from '../types';

type MyServicesNav = StackNavigationProp<RootStackParamList, 'MyServices'>;

const DARK_BG = '#2D2D2D';

interface GroupedServices {
  date: string;
  filas: Fila[];
}

/** Una fila = un servicio + el rol que tuve en él. */
interface Fila {
  service: ServiceAlert;
  rol: 'PROVEEDOR' | 'CONDUCTOR';
}

export function MyServicesScreen() {
  const navigation = useNavigation<MyServicesNav>();
  const { services, applications } = useMockStore();
  const { session } = useAuth();
  const userId = session?.user?.id;

  /**
   * Un mismo usuario puede ser proveedor y conductor, así que "Mis servicios"
   * lista todos los servicios en los que participa y marca el rol en cada fila
   * (igual que Estadísticas). Antes se filtraba por el modo abierto de la app y,
   * con el tab Conductor, un proveedor veía la lista vacía: por eso no llegaba a
   * la zona de pago de sus propios servicios.
   */
  const misServicios = useMemo<Fila[]>(
    () =>
      services
        .map((service): Fila | null => {
          if (service.provider_id === userId) return { service, rol: 'PROVEEDOR' };
          if (service.assigned_driver_id === userId) return { service, rol: 'CONDUCTOR' };
          return null;
        })
        .filter((fila): fila is Fila => fila !== null),
    [services, userId]
  );

  const grouped = useMemo<GroupedServices[]>(() => {
    const sorted = [...misServicios].sort(
      (a, b) => new Date(b.service.created_at).getTime() - new Date(a.service.created_at).getTime()
    );

    const map = new Map<string, Fila[]>();
    sorted.forEach((fila) => {
      const dateKey = new Date(fila.service.created_at).toLocaleDateString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(fila);
    });

    return Array.from(map.entries()).map(([date, filas]) => ({ date, filas }));
  }, [misServicios]);

  const postulantesDe = (serviceId: string) =>
    applications.filter((a) => a.serviceId === serviceId && a.status === 'PENDING').length;

  /**
   * Lleva a cada rol al lugar donde ACTÚA sobre ese servicio: el chat (ahí vive la
   * zona de pago cuando el viaje terminó), los postulantes, o "nuevo servicio"
   * para editarlo/cambiarle los grupos cuando todavía no tiene conductor.
   */
  const abrirServicio = (service: ServiceAlert, rol: 'PROVEEDOR' | 'CONDUCTOR') => {
    if (rol === 'CONDUCTOR') {
      navigation.navigate('Chat', {
        serviceId: service.id,
        driverId: userId,
        driverName: 'Conductor',
      });
      return;
    }
    if (service.assigned_driver_id) {
      navigation.navigate('Chat', {
        serviceId: service.id,
        driverId: service.assigned_driver_id,
        driverName: 'Conductor',
      });
      return;
    }
    if (postulantesDe(service.id) > 0) {
      navigation.navigate('ApplicantsScreen', { serviceId: service.id });
      return;
    }
    navigation.navigate('CreateService', { service });
  };

  const renderServiceCard = (service: ServiceAlert, rol: 'PROVEEDOR' | 'CONDUCTOR') => {
    // La señal de la tarjeta sale de `estadoDeServicio`: una sola fuente de verdad
    // (no compartido → buscando → postulantes → en camino → ubicado → proceso → pago)
    // y depende del rol que tuve en ese servicio: las señales de proveedor no
    // aplican a un servicio que hice como conductor.
    const estado = estadoDeServicio(service, postulantesDe(service.id), rol);

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => abrirServicio(service, rol)}
      >
        <View style={styles.cardLeft}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(service.company_name || service.provider_name || '?').charAt(0)}
            </Text>
          </View>
        </View>

        <View style={styles.cardCenter}>
          <View style={styles.cardHeader}>
            <Text style={styles.companyName} numberOfLines={1}>
              {service.company_name || service.provider_name || 'Empresa'}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: estado.color }]}>
              <Text style={styles.statusText}>{estado.etiqueta}</Text>
            </View>
          </View>

          <Text style={styles.routeText}>📍 {service.origin_address}</Text>
          <Text style={styles.routeText}>🏁 {service.destination_address}</Text>

          {service.observations && service.observations.length > 0 && (
            <Text style={styles.obsText}>📝 {service.observations.join(' • ')}</Text>
          )}

          <View style={styles.cardFooter}>
            <Text style={styles.fare}>S/ {service.fare}</Text>
            <Text style={styles.payment}>{service.payment_method || 'BCP'}</Text>
          </View>

          {/* Historial del cierre: monto, quién pagó y quién confirmó (0013). */}
          {!!historialDePago(service) && (
            <Text style={styles.pagoText}>✅ {historialDePago(service)}</Text>
          )}

          {/* Rol en ese servicio + entrada a la zona donde se actúa. */}
          <View style={styles.rolFila}>
            <View style={[styles.rolTag, { backgroundColor: rol === 'CONDUCTOR' ? AZUL : OSCURO }]}>
              <Text style={styles.rolTexto}>{rol === 'CONDUCTOR' ? 'Conductor' : 'Proveedor'}</Text>
            </View>
            <Text style={styles.abrirTexto}>Ver ›</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSection = ({ item }: { item: GroupedServices }) => (
    <View style={styles.section}>
      <Text style={styles.dateHeader}>{item.date}</Text>
      {item.filas.map((fila) => (
        <View key={fila.service.id}>{renderServiceCard(fila.service, fila.rol)}</View>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mis Servicios</Text>
        <TouchableOpacity style={styles.logoBtn}>
          <Text style={styles.logoIcon}>🚗</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={grouped}
        keyExtractor={(item) => item.date}
        renderItem={renderSection}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No tienes servicios registrados aún.</Text>
        }
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
    justifyContent: 'space-between',
    backgroundColor: DARK_BG,
    paddingTop: 50,
    paddingBottom: 14,
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
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  logoBtn: {
    padding: 4,
  },
  logoIcon: {
    fontSize: 22,
  },
  list: {
    padding: 16,
    paddingBottom: 30,
  },
  section: {
    marginBottom: 20,
  },
  dateHeader: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#555',
    marginBottom: 10,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardLeft: {
    justifyContent: 'center',
    marginRight: 12,
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
  cardCenter: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  companyName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  pagoText: {
    color: VERDE_ACCION,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
  },
  rolFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  rolTag: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  rolTexto: { color: '#fff', fontSize: 10, fontWeight: '700' },
  abrirTexto: { color: AZUL, fontSize: 11, fontWeight: '700' },
  routeText: {
    fontSize: 13,
    color: '#444',
    marginBottom: 2,
  },
  obsText: {
    fontSize: 12,
    color: '#E65100',
    fontStyle: 'italic',
    marginTop: 6,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  fare: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111',
  },
  payment: {
    fontSize: 13,
    color: '#666',
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 40,
    fontSize: 14,
  },
});
