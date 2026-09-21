import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  Animated,
} from 'react-native';

import { BotonDeBusqueda, BarraDeBusqueda } from '../components/Busqueda';
import { Fab } from '../components/Fab';
import { ServiceCard } from '../components/ServiceCard';
import { useAuth } from '../context/AuthContext';
import { useMockStore } from '../context/MockStoreContext';
import { useEstimacionesDeRuta } from '../hooks/useEstimacionesDeRuta';
import { useFilasDeslizantes } from '../hooks/useFilasDeslizantes';
import { usePosicionPublicada } from '../hooks/usePosicionPublicada';
import { Alert } from '../lib/alert';
import { ordenarEnProceso } from '../lib/apartadosDelInicio';
import { camposDeBusquedaDeServicio, filtrarPorBusqueda } from '../lib/busqueda';
import { AZUL, TEXTO_SUAVE } from '../lib/colors';
import { esProgramado } from '../lib/datetime';
import {
  AVISO_CANCELACION_FALLIDA,
  AVISO_POSTULACION_CANCELADA,
} from '../lib/deslizamientoDeLaTarjeta';
import { MiPostulacionEnLaTarjeta } from '../lib/estadoServicio';
import { ApartadoDelInicio, textoDelBoton } from '../lib/novedadesDelInicio';
import {
  guardarIniciosDelViaje,
  IniciosDelViaje,
  leerIniciosDelViaje,
  marcarInicio,
  yaInicio,
} from '../lib/inicioDelViaje';
import {
  esAceptadoMio as esAceptadoMioDe,
  estadoEfectivoDeMiPostulacion,
  filaDeMiPostulacion,
  planDelToqueDelConductor,
  listaBaseDelConductor,
  serviciosDelInicio,
} from '../lib/listaDelConductor';
import {
  huellaDeMiPostulacion,
  HuellasDePostulacion,
  leerHuellasDePostulacion,
} from '../lib/marcaDePostulacion';
import { leerChatDeVuelta, limpiarChatDeVuelta } from '../lib/navegacion';
import { esPremium } from '../lib/premium';
import { hayApiDeRutas } from '../lib/routes';
import { RootStackParamList } from '../navigation/RootNavigator';
import { ServiceAlert } from '../types';

type HomeNav = StackNavigationProp<RootStackParamList, 'Chat' | 'Settings'>;

const BLUE = '#3F51B5';
const LIGHT_BG = '#FFFFFF';
/** Cuánto se queda a la vista la tarjeta del rechazo recién llegado (3 segundos). */
const VISTA_DE_RECHAZO_MS = 3000;

/**
 * Apartados del inicio (17-09-2026): "Todos" → "Disponibles" y fuera "Reservas"
 * (las reservas viven dentro de "En proceso", ordenadas por `lib/apartadosDelInicio`).
 */
type StatusFilter = 'Disponibles' | 'En proceso';

interface DriverHomeProps {
  /** Novedades sin ver de cada apartado (las cuenta `useContadoresDelInicio`). */
  novedades?: { disponibles: number; enProceso: number };
  /** Tocar el botón de un apartado lo marca como visto: su número se apaga y baja el de arriba. */
  alEntrarAlApartado?: (apartado: ApartadoDelInicio) => void;
}

const STATUS_FILTERS: StatusFilter[] = ['Disponibles', 'En proceso'];
/** Separación entre tarjetas de servicio: el `marginBottom` de `ServiceCard` (12). */
const MARGEN_ENTRE_TARJETAS = 12;

export function DriverHomeScreen({ novedades, alEntrarAlApartado }: DriverHomeProps = {}) {
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
    cancelApplication,
    applyToService,
    driverDebt,
    debtThreshold,
    marcarArranqueDelViaje,
  } = useMockStore();

  const [activeStatus, setActiveStatus] = useState<StatusFilter>('Disponibles');
  const [showArchived, setShowArchived] = useState(false);

  /**
   * La lupa del apartado (18-09-2026): filtra la lista que se ESTÁ VIENDO con lo que se
   * escribe. Los contadores de las píldoras no se tocan: siguen siendo los del apartado
   * completo, porque el apartado no cambia porque uno busque dentro de él.
   */
  const [buscarAbierto, setBuscarAbierto] = useState(false);
  const [consulta, setConsulta] = useState('');

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

  /**
   * Nombre del grupo por el que le llegó la alerta (el que se ve en la tarjeta).
   *
   * Está en `useCallback` porque la búsqueda del apartado lo usa dentro de un `useMemo`:
   * sin esto la función cambiaría de identidad en cada render y el filtro se reharía
   * siempre (y el lint lo marca, con razón).
   */
  const getDisplayGroupName = useCallback(
    (serviceId: string): string | undefined => {
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
    },
    [services, groups]
  );

  /**
   * El servicio ya es MÍO: el proveedor me aceptó (aunque el viaje todavía no
   * arranque) y sigue vivo. Con esto se reconoce la tarjeta aceptada: se queda en
   * "Todos" con la franja "Servicio aceptado, toca para iniciar" hasta que el
   * conductor cumple ese toque, y entonces pasa a "En proceso".
   */
  const esAceptadoMio = (service: ServiceAlert) => esAceptadoMioDe(service, currentDriverId);

  /**
   * Marca local de "ya cumplí el toque de inicio" (ver `lib/inicioDelViaje.ts`): el
   * toque NO reporta ningún hito, solo mueve la tarjeta a "En proceso". Se guarda en
   * el dispositivo, así que sobrevive a recargar la app.
   */
  const [inicios, setInicios] = useState<IniciosDelViaje>({});
  /** Huella de la alerta cuando me postulé (para saber si el proveedor la editó). */
  const [huellas, setHuellas] = useState<HuellasDePostulacion>({});

  /** Relee las marcas del dispositivo (al montar y después de postularme). */
  const releerMarcas = useCallback(async () => {
    const [i, h] = await Promise.all([leerIniciosDelViaje(), leerHuellasDePostulacion()]);
    setInicios(i);
    setHuellas(h);
  }, []);

  useEffect(() => {
    let vivo = true;
    Promise.all([leerIniciosDelViaje(), leerHuellasDePostulacion()]).then(([i, h]) => {
      if (!vivo) return;
      setInicios(i);
      setHuellas(h);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const inicioCumplido = (serviceId: string) => yaInicio(inicios, serviceId, currentDriverId);
  const huellaAlPostular = (serviceId: string) =>
    huellaDeMiPostulacion(huellas, serviceId, currentDriverId);

  /**
   * Mi postulación en este servicio, para la franja de la tarjeta: el puesto que
   * ocupo, el aviso de que quedé fuera, o nada si el proveedor reabrió la alerta
   * (rechazo caducado). Es la única señal del estado de la tarjeta del conductor.
   */
  const miPostulacionDe = (service: ServiceAlert): MiPostulacionEnLaTarjeta => {
    const fila = filaDeMiPostulacion(applications, service.id, currentDriverId);
    return {
      estado: estadoEfectivoDeMiPostulacion(
        service,
        fila,
        huellaAlPostular(service.id),
        currentDriverId
      ),
      numero: fila?.order ?? null,
      iniciado: inicioCumplido(service.id),
    };
  };

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
        // Si sale de la pantalla antes de que se cumplan los 3 segundos, el aviso se
        // vuelve a mostrar al volver: el conductor tiene que alcanzar a verlo.
        const ahora = Date.now();
        Object.entries(visiblesRef.current).forEach(([id, hasta]) => {
          if (hasta > ahora) rechazosPendientes.current.add(id);
        });
      };
    }, [])
  );

  /**
   * Espejo de `rechazosVisibles` para poder mirarlo desde el cleanup del foco (ahí
   * no se puede leer el estado sin re-renderizar).
   */
  const visiblesRef = useRef<Record<string, number>>({});
  useEffect(() => {
    visiblesRef.current = rechazosVisibles;
  }, [rechazosVisibles]);

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

  /**
   * ¿Todavía toca pintar la tarjeta del rechazo recién llegado? Dentro de los 3
   * segundos siguientes al rechazo la tarjeta se ve (es el aviso); al cumplirse, se
   * va y el conductor ya no ve el servicio.
   */
  const rechazoReciente = (serviceId: string) => (rechazosVisibles[serviceId] ?? 0) > Date.now();

  const driverVehicleTypes = userProfile?.vehicleTypes ?? [];

  const groupIdList = useMemo(() => groups.map((g) => g.id), [groups]);

  /**
   * Reglas del inicio del conductor (lib/listaDelConductor): las listas y los
   * contadores salen de la MISMA función, así el apartado y su píldora no pueden
   * contradecirse.
   */
  const opcionesDelInicio = useMemo(
    () => ({
      userId: currentDriverId,
      groupIds: groupIdList,
      tiposDeVehiculo: driverVehicleTypes,
      mostrarArchivados: showArchived,
      rechazoReciente,
      inicioCumplido,
      huellaAlPostular,
    }),
    [
      currentDriverId,
      groupIdList,
      driverVehicleTypes,
      showArchived,
      rechazosVisibles,
      inicios,
      huellas,
    ]
  );

  const myActiveServices = useMemo(
    () => listaBaseDelConductor(services, applications, opcionesDelInicio),
    [services, applications, opcionesDelInicio]
  );

  /**
   * Volver al chat del que el conductor salió a abrir la ruta.
   *
   * El botón de navegación abre Waze en otra pestaña (la app no se descarga), pero al
   * volver el navegador del TELÉFONO puede recargar la pestaña: el conductor veía
   * "estado de inicio cargando el logo" y perdía el chat. El propio botón deja una marca
   * (`marcarChatDeVuelta`); aquí se consume UNA vez y, si el servicio sigue en su lista,
   * se le devuelve a ese chat. Sin servicios cargados no se consume: la marca espera.
   */
  useEffect(() => {
    if (myActiveServices.length === 0) return;
    let vigente = true;
    leerChatDeVuelta().then((serviceId) => {
      if (!vigente || !serviceId) return;
      limpiarChatDeVuelta();
      if (myActiveServices.some((s) => s.id === serviceId)) {
        navigation.navigate('Chat', { serviceId });
      }
    });
    return () => {
      vigente = false;
    };
  }, [myActiveServices, navigation]);

  // "Disponibles": alertas nuevas, postuladas, el rechazo recién llegado (3 segundos) y
  // la tarjeta ACEPTADA que todavía no arrancó (se queda aquí hasta el toque "toca para
  // iniciar"). Un rechazo en pie ya no se ve.
  // Ordenamiento estricto: Aceptados (esperando el toque) > Postulados > Nuevos.
  const sortedServices = useMemo(() => {
    const accepted: ServiceAlert[] = [];
    const applied: ServiceAlert[] = [];
    const news: ServiceAlert[] = [];

    serviciosDelInicio(myActiveServices, applications, 'Disponibles', opcionesDelInicio).forEach(
      (s) => {
        if (esAceptadoMio(s)) accepted.push(s);
        else if (getApplication(s.id)) applied.push(s);
        else news.push(s);
      }
    );

    const sortByDateDesc = (a: ServiceAlert, b: ServiceAlert) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

    return [
      ...accepted.sort(sortByDateDesc),
      ...applied.sort(sortByDateDesc),
      ...news.sort(sortByDateDesc),
    ];
  }, [myActiveServices, applications, opcionesDelInicio]);

  const handleCardPress = async (service: ServiceAlert) => {
    const application = getApplication(service.id);
    const notificationCount = getDriverNotification(service.id);

    const driverName =
      `${userProfile?.firstName || ''} ${userProfile?.lastName || ''}`.trim() || 'Conductor';

    // El ORDEN de las comprobaciones vive en `planDelToqueDelConductor` (regla probada):
    // primero "el servicio ya es mío" —abrir el chat, y cumplir el toque de inicio si
    // toca— y solo después "estoy postulado". Antes iba al revés y un conductor YA
    // ACEPTADO con su fila vieja en PENDING se quedaba sin poder abrir el chat del
    // servicio que estaba cubriendo.
    const plan = planDelToqueDelConductor({
      service,
      userId: currentDriverId,
      miEstado: estadoEfectivoDeMiPostulacion(
        service,
        application,
        huellaAlPostular(service.id),
        currentDriverId
      ),
      hayMensajeDelProveedor: notificationCount > 0,
      yaIniciadoElViaje: inicioCumplido(service.id),
    });

    if (plan.accion === 'NADA') return;

    if (plan.accion === 'ABRIR_CHAT') {
      // "Servicio aceptado, toca para iniciar": ESTE toque cumple esa orden y la
      // tarjeta pasa a "En proceso" (regla del usuario). El toque NO reporta ningún
      // hito —el conductor todavía no se ha dirigido al origen—: eso se marca en el
      // dispositivo (`lib/inicioDelViaje.ts`) y los hitos los reporta el deslizamiento
      // dentro del chat (Ubicado → En proceso → Finalizado).
      if (plan.cumpleElToqueDeInicio) {
        // Marca local (la que vale sin conexión) + marca en la base (0022), que es la
        // que deja al PROVEEDOR mover su tarjeta de "Publicados" a "En proceso".
        const actualizados = marcarInicio(inicios, service.id, currentDriverId);
        setInicios(actualizados);
        await guardarIniciosDelViaje(actualizados);
        // No se espera: el toque ya está marcado en el teléfono y la pantalla no debe
        // quedarse esperando a la red (el store avisa por consola si la 0022 falta).
        marcarArranqueDelViaje(service.id);
      }
      navigation.navigate('Chat', {
        serviceId: service.id,
        driverId: currentDriverId,
        driverName,
      });
      return;
    }

    // Alerta nueva disponible: postularme.
    if (isBlocked) {
      Alert.alert('Postulación bloqueada', 'Tu deuda supera el límite permitido.');
      return;
    }

    // El aviso de la postulación nueva lo recibe el PROVEEDOR (llega por tiempo real
    // a su dispositivo cuando la base guarda la fila): el conductor que se postula no
    // se avisa a sí mismo.
    applyToService(service.id, currentDriverId).then(releerMarcas);
  };

  const handleArchive = (serviceId: string) => {
    archiveService(serviceId);
  };

  const handleUnarchive = (serviceId: string) => {
    unarchiveService(serviceId);
  };

  /**
   * Deslizar la tarjeta con una postulación viva: el conductor DESISTE de postularse.
   *
   * Cancela SOLO su postulación (borra su fila de `applications`, no la marca rechazada) y
   * NO archiva el servicio: la tarjeta se queda en «Disponibles» y puede volver a postularse.
   * Regla del usuario, 18-09-2026.
   */
  const handleCancelarPostulacion = async (serviceId: string) => {
    const cancelada = await cancelApplication(serviceId, currentDriverId);
    // La tarjeta se repinta con la postulación ya fuera (franja y bloqueo del toque).
    await releerMarcas();
    Alert.alert(
      cancelada ? AVISO_POSTULACION_CANCELADA.titulo : AVISO_CANCELACION_FALLIDA.titulo,
      cancelada ? AVISO_POSTULACION_CANCELADA.cuerpo : AVISO_CANCELACION_FALLIDA.cuerpo
    );
  };

  const isDriver = role === 'DRIVER';
  const isBlocked = driverDebt > debtThreshold;

  const serviciosDelApartado = useMemo(() => {
    if (showArchived) {
      return myActiveServices
        .filter((s) => s.archived)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    if (activeStatus === 'En proceso') {
      // Todo lo mío que ya arrancó (el toque "toca para iniciar" o el primer hito), hasta
      // que el proceso de pago cierre. El orden lo fija `ordenarEnProceso`:
      // activos → reservas próximas (30 min antes de su hora) → pagos pendientes → reservas.
      return ordenarEnProceso(
        serviciosDelInicio(myActiveServices, applications, 'En proceso', opcionesDelInicio)
      );
    }
    return sortedServices;
  }, [
    sortedServices,
    myActiveServices,
    applications,
    activeStatus,
    showArchived,
    opcionesDelInicio,
  ]);

  /**
   * Lo que se pinta: el apartado ya pasado por la lupa. Busca en lo que se ve en las
   * tarjetas (proveedor, grupo, título, origen, destino y observaciones) y sin acentos,
   * así que vale lo mismo para Disponibles, En proceso y Archivados: la lupa del
   * apartado filtra SIEMPRE la lista que se está viendo.
   */
  const displayServices = useMemo(
    () =>
      filtrarPorBusqueda(serviciosDelApartado, consulta, (s) =>
        camposDeBusquedaDeServicio(s, getDisplayGroupName(s.id))
      ),
    [serviciosDelApartado, consulta, getDisplayGroupName]
  );

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

  /**
   * Las tarjetas de servicio que se deslizan al cambiar de sitio (pedido del usuario,
   * 20-09-2026): el mismo efecto que el de Mis grupos. Pasa cuando una tarjeta entra o sale de
   * un apartado —al aceptarte, al archivarla— y su hueco se cierra con las demás.
   */
  const { valorDe, medirLaFila } = useFilasDeslizantes(
    useMemo(() => displayServices.map((s) => s.id), [displayServices]),
    MARGEN_ENTRE_TARJETAS
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Secondary filters */}
      <View style={styles.filterBar}>
        <View style={styles.statusPills}>
          {STATUS_FILTERS.map((status) => {
            // El número son novedades sin ver (lo cuenta `useContadoresDelInicio`) y va DENTRO del
            // botón, al lado del texto: «Disponibles 10», «En proceso 2» (pedido del usuario,
            // 20-09-2026); antes era un globo rojo en la esquina. Al tocar el botón se apaga.
            const numero =
              status === 'En proceso' ? (novedades?.enProceso ?? 0) : (novedades?.disponibles ?? 0);
            return (
              <TouchableOpacity
                key={status}
                style={[styles.statusPill, activeStatus === status && styles.statusPillActive]}
                onPress={() => {
                  setActiveStatus(status);
                  alEntrarAlApartado?.(
                    status === 'En proceso' ? 'en-proceso-conductor' : 'disponibles'
                  );
                }}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    activeStatus === status && styles.statusPillTextActive,
                  ]}
                >
                  {textoDelBoton(status, numero)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.filterActions}>
          {/* La lupa del apartado: la misma que en Postulantes (el botón abre el campo
              y, abierto, cierra). */}
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
          placeholder="Buscar por proveedor, grupo, origen o destino"
        />
      )}

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
        renderItem={({ item, index }) => {
          const application = getApplication(item.id);
          const accepted = esAceptadoMio(item);
          const inEnProceso = activeStatus === 'En proceso';
          // En "En proceso" la tarjeta de una reserva se marca como tal (el resto son
          // viajes en curso o terminados con el pago abierto).
          const esReserva = inEnProceso && esProgramado(item);
          const notificationCount = getDriverNotification(item.id);
          const displayGroupName = getDisplayGroupName(item.id);

          return (
            /* La capa que se desliza: su `translateY` arranca en la distancia hasta su hueco
               viejo y vuelve a 0 (donde le toca ahora). */
            <Animated.View
              style={{ transform: [{ translateY: valorDe(item.id) }] }}
              onLayout={medirLaFila(index)}
            >
              <ServiceCard
                service={{
                  ...item,
                  origin_estimate: estimaciones[item.id]?.origen || item.origin_estimate,
                  destination_estimate: estimaciones[item.id]?.destino || item.destination_estimate,
                }}
                onPress={() => handleCardPress(item)}
                onArchive={() => handleArchive(item.id)}
                onUnarchive={() => handleUnarchive(item.id)}
                onCancelarPostulacion={() => handleCancelarPostulacion(item.id)}
                showArchived={showArchived}
                disableSwipe={inEnProceso || accepted}
                showReservaIndicator={esReserva}
                isApplied={!!application}
                miPostulacion={miPostulacionDe(item)}
                notificationCount={notificationCount}
                groupName={displayGroupName}
              />
            </Animated.View>
          );
        }}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {consulta.trim()
              ? 'Ningún servicio coincide con la búsqueda.'
              : showArchived
                ? 'No hay servicios archivados'
                : activeStatus === 'En proceso'
                  ? 'Todavía no tienes servicios en proceso.'
                  : 'No hay servicios disponibles'}
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
    /**
     * Sin el hueco SUPERIOR (18-09-2026): esta pantalla va DEBAJO de la cabecera
     * (`MainHeader`), que ya reserva el notch. Antes lo reservaban las dos y quedaba una
     * franja blanca de 59 px entre la barra negra y los botones del apartado — es el
     * "espacio en blanco" que reportó el usuario desde su iPhone.
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
    // 20-09-2026: fuera la línea fina de abajo (el usuario la veía como un divisor entre los
    // botones de disponibles/en proceso y el apartado de archivados).
  },
  statusPills: {
    flexDirection: 'row',
    // Igual que los botones de arriba: si con el número no caben, pasan a la línea de abajo.
    flexWrap: 'wrap',
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
    // 20-09-2026: y fuera la línea de abajo (entre «Archivados» y las tarjetas).
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
