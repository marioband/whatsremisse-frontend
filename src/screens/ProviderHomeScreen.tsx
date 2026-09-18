import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView } from 'react-native';

import { BotonDeBusqueda, BarraDeBusqueda } from '../components/Busqueda';
import { EstadoServicioBar } from '../components/EstadoServicioBar';
import { Fab } from '../components/Fab';
import { ProviderServiceCard } from '../components/ProviderServiceCard';
import { useAuth } from '../context/AuthContext';
import { useMockStore } from '../context/MockStoreContext';
import { destinoDeLaTarjetaDelProveedor } from '../lib/accionDeLaTarjeta';
import {
  estaEnProcesoDelProveedor,
  listaDelProveedor,
  ordenarEnProceso,
} from '../lib/apartadosDelInicio';
import { camposDeBusquedaDeServicio, filtrarPorBusqueda } from '../lib/busqueda';
import { TEXTO_SUAVE } from '../lib/colors';
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
const LIGHT_BG = '#FFFFFF';

/**
 * Apartados del inicio del PROVEEDOR (17-09-2026): "Todos" → "Publicados"; fuera
 * "Reservas" y "Finalizados". Las reservas y lo terminado con el pago abierto viven
 * dentro de "En proceso", ordenados por `lib/apartadosDelInicio.ts`.
 */
type StatusFilter = 'Publicados' | 'En proceso';

const STATUS_FILTERS: StatusFilter[] = ['Publicados', 'En proceso'];

/**
 * Regla del usuario (17-09-2026): la alerta se cierra sola (20 minutos "al momento" /
 * 10 minutos después de la hora) y, **si nadie la tomó, sale del inicio de inmediato**
 * —ya no se reprograma: la fila se queda en la base—. Antes se quedaba 24 h "en gracia"
 * con la franja roja "Servicio vencido" y una cuenta atrás, y el usuario lo reportó
 * como "el servicio vencido sigue activo". La condición vive en
 * `lib/apartadosDelInicio.listaDelProveedor` (con `caducoNadieLaTomo`), la MISMA que
 * usan la lista y el contador. Lo que sí se tomó sigue vivo hasta cerrar el pago.
 */

export function ProviderHomeScreen() {
  const navigation = useNavigation<HomeNav>();
  const { session } = useAuth();
  const { services, applications, archiveService } = useMockStore();

  const [activeStatus, setActiveStatus] = useState<StatusFilter>('Publicados');
  const [showArchived, setShowArchived] = useState(false);

  /**
   * La lupa del apartado (18-09-2026): filtra la lista que se está VIENDO (Publicados,
   * En proceso o Archivados). Los contadores de las píldoras no cambian: son del
   * apartado completo, no de la búsqueda.
   */
  const [buscarAbierto, setBuscarAbierto] = useState(false);
  const [consulta, setConsulta] = useState('');

  // En este modo solo se ven los servicios que yo publiqué como proveedor; los
  // de otros usuarios (aunque estén abiertos o ya aceptados) no son míos.
  const myProviderServices = useMemo(
    () => services.filter((s) => isVisibleAsProvider(s, session?.user?.id)),
    [services, session?.user?.id]
  );

  // Servicios que veo en el inicio (o en "Archivados"): la regla vive en
  // `lib/apartadosDelInicio.listaDelProveedor` — fuera archivados, lo ya cerrado y lo
  // que caducó sin que nadie lo tomara (sin las 24 h de gracia).
  const serviciosDelInicio = useMemo(
    () => listaDelProveedor(myProviderServices, { mostrarArchivados: showArchived }),
    [myProviderServices, showArchived]
  );

  // Contador de la píldora "En proceso": sale de la MISMA función que la lista, así que
  // no puede contar una tarjeta que ya no se ve. Los asignados que esperan el toque
  // "toca para iniciar" siguen contando en "Publicados".
  const enProcesoCount = useMemo(
    () => listaDelProveedor(myProviderServices).filter((s) => estaEnProcesoDelProveedor(s)).length,
    [myProviderServices]
  );

  const serviciosDelApartado = useMemo(() => {
    if (activeStatus === 'En proceso') {
      // El viaje en curso, las reservas en curso y lo terminado con el pago abierto,
      // ordenados por `ordenarEnProceso` (activos → reservas próximas → pagos
      // pendientes → reservas).
      return ordenarEnProceso(serviciosDelInicio.filter((s) => estaEnProcesoDelProveedor(s)));
    }

    // "Publicados": todo lo demás, incluidos los servicios con conductor aceptado que
    // todavía no hicieron el toque "toca para iniciar" (regla del usuario).
    return serviciosDelInicio.filter((s) => !estaEnProcesoDelProveedor(s));
  }, [serviciosDelInicio, activeStatus]);

  /**
   * Lo que se pinta: el apartado ya pasado por la lupa. Busca en lo que se ve en las
   * tarjetas (nombre del proveedor, título, origen, destino y observaciones), sin
   * acentos ni mayúsculas. El proveedor es su propio nombre, así que "mi nombre" también
   * filtra (útil para separar servicios de varias cuentas o locales).
   */
  const filteredServices = useMemo(
    () => filtrarPorBusqueda(serviciosDelApartado, consulta, (s) => camposDeBusquedaDeServicio(s)),
    [serviciosDelApartado, consulta]
  );

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
      // La gracia de 24 h se eliminó (17-09-2026): una alerta caducada sin conductor ya
      // no se lista en el inicio, así que este caso no se da desde aquí. Se deja en
      // `false` para no abrir el editor por estar vencida.
      vencidaEnGracia: false,
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

        {/* Franja de estado: una sola señal, la que devuelve estadoDeServicio. Ya no
            lleva la cuenta atrás de la gracia de 24 h: esa gracia se eliminó. */}
        <View style={styles.cardFooter}>
          <EstadoServicioBar service={item} postulantes={applicantCount} radius={16} />
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
            const count = status === 'En proceso' ? enProcesoCount : 0;
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
                {status === 'En proceso' && count > 0 && (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{count > 99 ? '99+' : count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.filterActions}>
          {/* La lupa del apartado: la misma que en Postulantes y en el inicio del
              conductor (el botón abre el campo y, abierto, cierra). */}
          <BotonDeBusqueda
            abierto={buscarAbierto}
            onPress={() => {
              setBuscarAbierto((abierto) => !abierto);
              setConsulta('');
            }}
            color={TEXTO_SUAVE}
            tamano={20}
            estilo={styles.filterBtn}
            etiqueta="Buscar servicio"
          />
          <TouchableOpacity style={[styles.filterBtn, styles.filterBtnSeparado]}>
            <Text style={styles.filterIcon}>▼</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* El campo de la lupa, debajo de las píldoras del apartado */}
      {buscarAbierto && (
        <BarraDeBusqueda
          consulta={consulta}
          onCambiarConsulta={setConsulta}
          placeholder="Buscar por título, origen o destino"
        />
      )}

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
            {consulta.trim()
              ? 'Ningún servicio coincide con la búsqueda.'
              : showArchived
                ? 'No hay servicios archivados'
                : 'No hay servicios disponibles'}
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
    /**
     * Sin el hueco SUPERIOR (18-09-2026): va DEBAJO de la cabecera, que ya reserva el
     * notch; con los dos, quedaba una franja blanca entre la barra negra y los botones.
     */
    paddingTop: 0,
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
  filterActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterBtn: {
    padding: 8,
    backgroundColor: '#f0f2f5',
    borderRadius: 8,
    /* La caja del ▼ y la de la lupa miden lo mismo: van en la misma fila. */
    minWidth: 36,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBtnSeparado: {
    marginLeft: 8,
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
