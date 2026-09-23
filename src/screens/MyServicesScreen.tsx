import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { useMockStore } from '../context/MockStoreContext';
import { useNombresDeProveedores } from '../hooks/useNombreDelProveedor';
import { AZUL, OSCURO, VERDE_ACCION } from '../lib/colors';
import {
  estaPagadoYCerrado,
  estadoDeServicio,
  etiquetaParaMisServicios,
} from '../lib/estadoServicio';
import { nombreParaMostrar } from '../lib/nombreDelProveedor';
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
  // Nombre del proveedor de cada servicio (el que configuró en su perfil o, si no lo
  // configuró, su primer nombre y su primer apellido): una sola llamada por proveedor.
  const nombresDeProveedor = useNombresDeProveedores(services);
  const userId = session?.user?.id;

  /**
   * Un mismo usuario puede ser proveedor y conductor, así que "Mis servicios" marca el
   * rol en cada fila (igual que Estadísticas) en vez de filtrar por el modo abierto.
   *
   * AQUÍ SOLO ENTRAN LOS SERVICIOS CON EL PROCESO DE PAGO YA CERRADO (regla del usuario,
   * 17-09-2026): mientras el servicio está en "En proceso" (viaje en curso, reserva o
   * terminado con el pago abierto) la tarjeta vive en el inicio, no aquí. Antes se
   * listaban todos los servicios en los que participo y se adelantaba la tarjeta.
   */
  const misServicios = useMemo<Fila[]>(
    () =>
      services
        .filter((service) => estaPagadoYCerrado(service))
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
              {nombreParaMostrar(service, nombresDeProveedor[service.provider_id]).charAt(0)}
            </Text>
          </View>
        </View>

        <View style={styles.cardCenter}>
          <View style={styles.cardHeader}>
            <Text style={styles.companyName} numberOfLines={1}>
              {nombreParaMostrar(service, nombresDeProveedor[service.provider_id])}
            </Text>
            {/* Sin el "Pagado y cerrado": lo retiró el usuario el 18-09-2026 (lo
                cuenta el historial de pago de abajo). El resto de estados sí se ven. */}
            {!!etiquetaParaMisServicios(estado.etiqueta) && (
              <View style={[styles.statusBadge, { backgroundColor: estado.color }]}>
                <Text style={styles.statusText}>{etiquetaParaMisServicios(estado.etiqueta)}</Text>
              </View>
            )}
          </View>

          {/* Los mismos puntos que las tarjetas del inicio (18-09-2026): origen en azul
              de marca y destino en oscuro, en vez de los emoji de pin y bandera. */}
          <View style={styles.routeRow}>
            <View style={styles.dotOrigin} />
            <Text style={styles.routeText} numberOfLines={1}>
              {service.origin_address}
            </Text>
          </View>
          <View style={styles.routeRow}>
            <View style={styles.dotDestination} />
            <Text style={styles.routeText} numberOfLines={1}>
              {service.destination_address}
            </Text>
          </View>

          {service.observations && service.observations.length > 0 && (
            <Text style={styles.obsText}>📝 {service.observations.join(' • ')}</Text>
          )}

          {/* Historial del cierre: monto, quién pagó y quién confirmó (0013). */}
          {/* Historial del cierre, sin el check verde (el usuario lo retiró el
              18-09-2026: el texto ya dice que se pagó y quién confirmó). */}
          {!!historialDePago(service) && (
            <Text style={styles.pagoText}>{historialDePago(service)}</Text>
          )}

          {/* Rol en ese servicio + entrada a la zona donde se actúa. */}
          <View style={styles.rolFila}>
            <View style={[styles.rolTag, { backgroundColor: rol === 'CONDUCTOR' ? AZUL : OSCURO }]}>
              <Text style={styles.rolTexto}>{rol === 'CONDUCTOR' ? 'Conductor' : 'Proveedor'}</Text>
            </View>
            <Text style={styles.abrirTexto}>Ver ›</Text>
          </View>
        </View>

        {/* La tarifa, la fecha de pago y el tipo de pago van en la COLUMNA DERECHA, alineadas a la
            derecha de la tarjeta, con la MISMA distribución que las tarjetas de servicio de los
            inicios (pedido del usuario, 20-09-2026). Antes estaban en un pie debajo de las rutas,
            y así no se leían como el resto de tarjetas del app. */}
        <View style={styles.rightColumn}>
          <Text style={styles.amount}>S/ {service.fare}</Text>
          <Text style={styles.paymentTerm}>{service.payment_term || 'Al término'}</Text>
          <Text style={styles.paymentMethod}>{service.payment_method || 'BCP'}</Text>
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
        <Text style={styles.headerTitle}>Mis servicios</Text>
        {/* Sin el icono del auto (el usuario pidió quitarlo, 18-09-2026): el espaciador
            deja el título centrado, igual que en Cuenta. */}
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        data={grouped}
        keyExtractor={(item) => item.date}
        renderItem={renderSection}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            Aquí aparecen los servicios con el pago ya cerrado. Los que están en curso siguen en el
            inicio, en "En proceso".
          </Text>
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
  headerSpacer: {
    /* Ocupa el sitio del botón que se quitó, para que el título siga centrado. */
    width: 24,
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
    /* Mismo fondo para todas las tarjetas de servicio (18-09-2026). */
    backgroundColor: '#F2F2F2',
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
  /* La etiqueta del rol y el «Ver ›» van uno debajo del otro, los dos pegados al borde izquierdo
     del texto de arriba (pedido del usuario, 22-09-2026): antes el «Ver ›» quedaba empujado al
     borde derecho de la tarjeta, lejos del resto de la información. */
  rolFila: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginTop: 8,
  },
  rolTag: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  rolTexto: { color: '#fff', fontSize: 10, fontWeight: '700' },
  abrirTexto: { color: AZUL, fontSize: 11, fontWeight: '700', marginTop: 4 },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  /* Igual que ServiceCard: origen azul de marca, destino oscuro. */
  dotOrigin: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: AZUL,
    marginRight: 8,
  },
  dotDestination: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: OSCURO,
    marginRight: 8,
  },
  routeText: {
    fontSize: 13,
    color: '#444',
    flex: 1,
  },
  obsText: {
    fontSize: 12,
    color: '#E65100',
    fontStyle: 'italic',
    marginTop: 6,
  },
  /** Columna derecha: tarifa, fecha de pago y tipo de pago, pegados al borde derecho. */
  rightColumn: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    marginLeft: 10,
    minWidth: 70,
  },
  amount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 4,
  },
  paymentTerm: {
    fontSize: 11,
    color: '#666',
    marginBottom: 2,
  },
  paymentMethod: {
    fontSize: 11,
    color: '#888',
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 40,
    fontSize: 14,
  },
});
