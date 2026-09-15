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
  Image,
} from 'react-native';

import { useAuth } from '../context/AuthContext';
import { useMockStore } from '../context/MockStoreContext';
import { useEstimacionesDePostulantes } from '../hooks/useEstimacionesDePostulantes';
import { Alert } from '../lib/alert';
import {
  AZUL,
  BORDE_SUAVE,
  FONDO_TARJETA,
  OSCURO,
  ROJO_ACCION,
  TEXTO,
  TEXTO_SUAVE,
  TEXTO_TENUE,
  VERDE_ACCION,
} from '../lib/colors';
import { fetchPublicProfile } from '../lib/database';
import { conGuion, DatosPublicos, datosDesdePerfilPublico, inicialDe } from '../lib/perfilPublico';
import { esPremium } from '../lib/premium';
import { hayApiDeRutas, Punto } from '../lib/routes';
import { RootStackParamList } from '../navigation/RootNavigator';

type ApplicantsNav = StackNavigationProp<
  RootStackParamList,
  'ApplicantsScreen' | 'Settings' | 'CreateService'
>;
type ApplicantsRoute = RouteProp<RootStackParamList, 'ApplicantsScreen'>;

/** Sin acentos ni mayúsculas, para que "jose" encuentre "José". */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Postulantes del servicio, con el formato de la referencia del usuario:
 * avatar, "Datos del conductor" (nombres y apellidos), "Datos del vehículo"
 * (marca, modelo y color) con el tiempo y la distancia del postulante al punto
 * de origen a la derecha, y tres acciones al pie:
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
    emitChatNotification,
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
    approveApplication(serviceId, driverId);
    emitChatNotification(
      '¡Postulación aceptada!',
      `Fuiste seleccionado para el servicio: ${service?.title || serviceId}. El chat ya está disponible.`,
      { serviceId, driverId, type: 'APPLICATION_ACCEPTED' }
    );
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
          onPress: () => {
            rejectApplication(service.id);
            const sinCompartir = {
              ...service,
              group_id: '',
              assigned_driver_id: null,
              driver_progress_step: 0,
            };
            updateService(sinCompartir);
            navigation.navigate('CreateService', { service: sinCompartir });
          },
        },
      ]
    );
  };

  const renderApplicant = ({ item }: { item: { serviceId: string; driverId: string } }) => {
    const datos = datosDe(item.driverId);
    const estimacion = estimaciones[item.driverId];

    return (
      <View style={styles.card}>
        <View style={styles.topRow}>
          {datos.foto ? (
            <Image source={{ uri: datos.foto }} style={styles.avatar} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{inicialDe(datos)}</Text>
            </View>
          )}

          <View style={styles.dataColumn}>
            <Text style={styles.sectionTitle}>Datos del conductor</Text>
            <Text style={styles.fieldText}>Nombres: {conGuion(datos.nombres)}</Text>
            <Text style={styles.fieldText}>Apellidos: {conGuion(datos.apellidos)}</Text>

            <View style={styles.vehicleHeader}>
              <Text style={[styles.sectionTitle, styles.vehicleTitle]}>Datos del vehículo</Text>
              {!!estimacion && <Text style={styles.estimate}>{estimacion}</Text>}
            </View>
            <Text style={styles.fieldText}>Marca: {conGuion(datos.marca)}</Text>
            <Text style={styles.fieldText}>Modelo: {conGuion(datos.modelo)}</Text>
            <Text style={styles.fieldText}>Color: {conGuion(datos.color)}</Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.acceptBtn]}
            onPress={() => handleAceptar(item.driverId)}
            activeOpacity={0.85}
          >
            <Text style={styles.actionBtnText}>Aceptar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.chatBtn]}
            onPress={() => irAlChat(item.driverId)}
            activeOpacity={0.85}
          >
            <Text style={styles.actionBtnText}>Conversar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={() => handleRechazar(item.driverId)}
            activeOpacity={0.85}
          >
            <Text style={styles.actionBtnText}>Rechazar</Text>
          </TouchableOpacity>
        </View>
      </View>
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
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => {
              setBuscarAbierto((abierto) => !abierto);
              setConsulta('');
            }}
            accessibilityLabel="Buscar postulante"
          >
            <Text style={styles.icon}>{buscarAbierto ? '✕' : '⌕'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Settings')}>
            <Text style={styles.icon}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      {buscarAbierto && (
        <View style={styles.searchBar}>
          <View style={styles.searchPill}>
            <Text style={styles.searchIcon}>⌕</Text>
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
    backgroundColor: OSCURO,
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
    color: TEXTO_SUAVE,
    fontSize: 18,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: TEXTO,
    paddingVertical: 0,
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
  card: {
    backgroundColor: FONDO_TARJETA,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: OSCURO,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 20,
  },
  avatarText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  dataColumn: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: TEXTO,
    marginBottom: 6,
  },
  vehicleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  vehicleTitle: {
    marginBottom: 6,
  },
  estimate: {
    fontSize: 14,
    color: TEXTO_SUAVE,
    marginLeft: 8,
  },
  fieldText: {
    fontSize: 14,
    color: TEXTO_SUAVE,
    marginBottom: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  acceptBtn: {
    backgroundColor: VERDE_ACCION,
    marginRight: 5,
  },
  chatBtn: {
    backgroundColor: AZUL,
    marginRight: 5,
  },
  rejectBtn: {
    backgroundColor: ROJO_ACCION,
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
