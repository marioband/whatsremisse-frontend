import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  Platform,
} from 'react-native';

import { ApplicantCard } from '../components/ApplicantCard';
import { Icono, ICONO_AJUSTES, ICONO_BUSCAR } from '../components/Icono';
import { useAuth } from '../context/AuthContext';
import { useMockStore } from '../context/MockStoreContext';
import { useEstimacionesDePostulantes } from '../hooks/useEstimacionesDePostulantes';
import { Alert } from '../lib/alert';
import { normalizar } from '../lib/busqueda';
import {
  BORDE_SUAVE,
  FONDO_TARJETA,
  OSCURO,
  ROJO_ACCION,
  TEXTO,
  TEXTO_SUAVE,
  TEXTO_TENUE,
} from '../lib/colors';
import { fetchPublicProfile } from '../lib/database';
import { textoDeErrorParaElUsuario } from '../lib/errors';
import { DatosPublicos, datosDesdePerfilPublico } from '../lib/perfilPublico';
import { esPremium } from '../lib/premium';
import { hayApiDeRutas, Punto } from '../lib/routes';
import { RootStackParamList } from '../navigation/RootNavigator';
import { IconoDeAtras } from '../components/IconoDeAtras';

type ApplicantsNav = StackNavigationProp<
  RootStackParamList,
  'ApplicantsScreen' | 'Settings' | 'CreateService'
>;
type ApplicantsRoute = RouteProp<RootStackParamList, 'ApplicantsScreen'>;

/**
 * Postulantes del servicio, con la estructura de la última referencia del usuario:
 * el tiempo y la distancia al punto de origen **centrados arriba**, y debajo dos
 * columnas de datos SIN títulos —conductor (nombres, apellidos, DNI y celular) a la
 * izquierda, vehículo (marca, modelo, color y placa) a la derecha— junto al avatar.
 * Al pie, tres acciones:
 *   - Aceptar  (verde): acepta el servicio y lleva al chat ya aceptado.
 *   - Conversar (azul): lleva al chat sin aceptar (el botón de aceptar está allí).
 *   - Rechazar (rojo): descarta a ese postulante.
 */
export function ApplicantsScreen() {
  const navigation = useNavigation<ApplicantsNav>();
  const route = useRoute<ApplicantsRoute>();
  const { serviceId } = route.params;
  const { profile } = useAuth();
  const {
    applications,
    approveApplication,
    rejectApplication,
    rejectApplicationFrom,
    services,
    updateService,
    compartirServicio,
  } = useMockStore();

  const serviceApplicants = useMemo(
    () =>
      applications
        .filter((a) => a.serviceId === serviceId && a.status === 'PENDING')
        .sort((a, b) => a.order - b.order),
    [applications, serviceId]
  );

  const service = useMemo(
    () => services.find((s) => s.id === serviceId) || null,
    [services, serviceId]
  );

  // Datos reales de cada postulante (nombre y vehículo). Los lee la función
  // `public_profile`, que autoriza al proveedor del servicio con sus postulantes.
  const [perfiles, setPerfiles] = useState<Record<string, DatosPublicos>>({});
  const idsPostulantes = useMemo(
    () => serviceApplicants.map((a) => a.driverId),
    [serviceApplicants]
  );
  const clavePostulantes = idsPostulantes.join(',');

  useEffect(() => {
    if (idsPostulantes.length === 0) return;
    let vigente = true;

    (async () => {
      for (const id of idsPostulantes) {
        if (perfiles[id]) continue;
        try {
          const resultado = await fetchPublicProfile(id);
          if (!vigente) return;
          if (resultado.profile) {
            const datos = datosDesdePerfilPublico(resultado.profile);
            setPerfiles((actuales) => ({ ...actuales, [id]: datos }));
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[postulantes] no se pudo leer el perfil', id, err);
        }
      }
    })();

    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clavePostulantes]);

  // Tiempo y distancia del postulante al origen (función Premium).
  const premium = esPremium(profile);
  const origen: Punto | null = useMemo(() => {
    if (!service) return null;
    return {
      address: service.origin_address,
      lat: service.origin_lat || null,
      lng: service.origin_lng || null,
    };
  }, [service]);
  const { estimaciones } = useEstimacionesDePostulantes(
    serviceId,
    idsPostulantes,
    origen,
    premium && hayApiDeRutas()
  );

  const datosDe = (driverId: string): DatosPublicos =>
    perfiles[driverId] || datosDesdePerfilPublico(null);

  // Búsqueda sobre las tarjetas de postulantes (la lupa de la cabecera): por
  // nombre, teléfono, DNI o datos del vehículo, sin acentos ni mayúsculas.
  const [buscarAbierto, setBuscarAbierto] = useState(false);
  const [consulta, setConsulta] = useState('');

  const postulantesVisibles = useMemo(() => {
    const q = normalizar(consulta.trim());
    if (!q) return serviceApplicants;
    return serviceApplicants.filter((a) => {
      const datos = perfiles[a.driverId] || datosDesdePerfilPublico(null);
      const campos = [
        datos.nombres,
        datos.apellidos,
        datos.telefono,
        datos.dni,
        datos.marca,
        datos.modelo,
        datos.color,
        datos.placa,
      ];
      return campos.some((campo) => normalizar(campo || '').includes(q));
    });
  }, [serviceApplicants, consulta, perfiles]);

  const irAlChat = (driverId: string) => {
    const datos = datosDe(driverId);
    navigation.navigate('Chat', {
      serviceId,
      driverId,
      driverName: `${datos.nombres} ${datos.apellidos}`.trim(),
    });
  };

  const handleAceptar = (driverId: string) => {
    // El aviso de la aceptación lo recibe el conductor por tiempo real (el
    // proveedor es quien acepta: no se avisa a sí mismo).
    approveApplication(serviceId, driverId);
    irAlChat(driverId);
  };

  const handleRechazar = (driverId: string) => {
    rejectApplicationFrom(serviceId, driverId);
  };

  /**
   * Cancelar búsqueda: rechaza las postulaciones pendientes y deja la tarjeta
   * sin compartir; se vuelve a "nuevo servicio" con todos los datos guardados
   * para editarla, anularla, guardarla o volver a elegir grupos.
   */
  const handleCancelarBusqueda = () => {
    if (!service) return;
    Alert.alert(
      'Cancelar búsqueda',
      'Se descartan los postulantes pendientes y la tarjeta deja de estar compartida. ' +
        'Volverás a "nuevo servicio" para editarla, anularla, guardarla o elegir otros grupos.',
      [
        { text: 'Volver', style: 'cancel' },
        {
          text: 'Cancelar búsqueda',
          style: 'destructive',
          onPress: async () => {
            try {
              rejectApplication(service.id);
              // 0018: dejar de estar compartido es borrar los grupos, no solo el
              // principal; si no, los conductores de los otros grupos la seguirían
              // viendo.
              const dejoDeCompartirse = await compartirServicio(service.id, []);
              // Sin `driver_progress_step: 0`: el paso del viaje solo avanza (regla de
              // `fusionarServicio`); aquí vale 0 de todas formas porque la tarjeta
              // todavía no tiene conductor asignado.
              const sinCompartir = {
                ...service,
                group_id: '',
                assigned_driver_id: null,
              };
              // Si la base no la dejó de compartir, NO se navega: la pantalla diría que ya
              // no está compartida mientras los conductores la siguen viendo (y la tarjeta
              // volvería a aparecer compartida al recargar).
              if (!dejoDeCompartirse) {
                Alert.alert(
                  'No se pudo cancelar la búsqueda',
                  'La tarjeta sigue compartida con tus grupos. Vuelve a intentarlo.'
                );
                return;
              }
              updateService(sinCompartir);
              navigation.navigate('CreateService', { service: sinCompartir });
            } catch (err) {
              Alert.alert('No se pudo cancelar la búsqueda', textoDeErrorParaElUsuario(err));
            }
          },
        },
      ]
    );
  };

  const renderApplicant = ({ item }: { item: { serviceId: string; driverId: string } }) => (
    <ApplicantCard
      datos={datosDe(item.driverId)}
      estimacion={estimaciones[item.driverId]}
      onAceptar={() => handleAceptar(item.driverId)}
      onConversar={() => irAlChat(item.driverId)}
      onRechazar={() => handleRechazar(item.driverId)}
    />
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <IconoDeAtras />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Postulantes</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => {
              setBuscarAbierto((abierto) => !abierto);
              setConsulta('');
            }}
            accessibilityLabel="Buscar postulante"
          >
            {/* Abierta la búsqueda, el botón cierra: ahí sigue el signo ✕. */}
            {buscarAbierto ? (
              <Text style={styles.icon}>✕</Text>
            ) : (
              <Icono fuente={ICONO_BUSCAR} tamano={22} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('Settings')}
            accessibilityLabel="Cuenta"
          >
            <Icono fuente={ICONO_AJUSTES} tamano={22} />
          </TouchableOpacity>
        </View>
      </View>

      {buscarAbierto && (
        <View style={styles.searchBar}>
          <View style={styles.searchPill}>
            <Icono
              fuente={ICONO_BUSCAR}
              tamano={20}
              color={TEXTO_SUAVE}
              estilo={styles.searchIcon}
            />
            <TextInput
              style={styles.searchInput}
              value={consulta}
              onChangeText={setConsulta}
              placeholder="Buscar por nombre, teléfono o vehículo"
              placeholderTextColor={TEXTO_TENUE}
              autoFocus
            />
          </View>
        </View>
      )}

      <FlatList
        data={postulantesVisibles}
        keyExtractor={(item) => `${item.serviceId}-${item.driverId}`}
        renderItem={renderApplicant}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {consulta.trim()
              ? 'Ningún postulante coincide con la búsqueda.'
              : 'No hay postulantes pendientes.'}
          </Text>
        }
      />

      {/* Pie: cancelar la búsqueda devuelve el servicio a "nuevo servicio" */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.cancelSearchBtn} onPress={handleCancelarBusqueda}>
          <Text style={styles.cancelSearchText}>Cancelar búsqueda</Text>
        </TouchableOpacity>
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
    backgroundColor: '#2D2D2D',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
    minHeight: 102,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
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
  searchBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: FONDO_TARJETA,
    borderRadius: 20,
    paddingHorizontal: 14,
    height: 40,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: TEXTO,
    paddingVertical: 0,
    // Sin el recuadro de foco del navegador (misma regla que la barra del chat).
    ...Platform.select({ web: { outlineStyle: 'none' } as object }),
  },
  footer: {
    backgroundColor: '#fff',
    borderTopWidth: 0.5,
    borderTopColor: BORDE_SUAVE,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelSearchBtn: {
    backgroundColor: ROJO_ACCION,
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 36,
  },
  cancelSearchText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  list: {
    padding: 16,
    paddingBottom: 40,
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 40,
  },
});
