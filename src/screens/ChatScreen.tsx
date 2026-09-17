import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Text,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  TouchableOpacity,
  View,
} from 'react-native';

import { BotonDeNavegacion } from '../components/BotonDeNavegacion';
import { ChatInputBar, AttachmentType } from '../components/ChatInputBar';
import { ServiceCard } from '../components/ServiceCard';
import { SwipeStatusButton } from '../components/SwipeStatusButton';
import {
  ChatHeader,
  EvaluationBar,
  MessageList,
  PagoDelServicio,
  ProviderStatusBar,
} from '../components/chat';
import { useAuth } from '../context/AuthContext';
import { useMockStore } from '../context/MockStoreContext';
import { useRealtimeServiceMessages } from '../hooks/useRealtimeServiceMessages';
import { ULTIMO_HITO_VIAJE, useServiceProgress } from '../hooks/useServiceProgress';
import { Alert } from '../lib/alert';
import { AZUL } from '../lib/colors';
import { nombreDeLaContraparte, rolDeLaContraparte } from '../lib/contraparte';
import {
  datosDePagoDelConductor,
  datosDePagoDelProveedor,
  deleteServiceMessage,
  esEdicionSinMigracion,
  esTablaAusente,
  fetchProfileById,
  fetchServiceMessages,
  insertServiceMessage,
  ServiceMessage,
  updateServiceMessage,
} from '../lib/database';
import { describeError } from '../lib/errors';
import { IniciosDelViaje, leerIniciosDelViaje, yaInicio } from '../lib/inicioDelViaje';
import { estadoEfectivoDeMiPostulacion, filaDeMiPostulacion } from '../lib/listaDelConductor';
import {
  huellaDeMiPostulacion,
  HuellasDePostulacion,
  leerHuellasDePostulacion,
} from '../lib/marcaDePostulacion';
import {
  AVISO_MENSAJE_ENVIANDO,
  AVISO_MIGRACION_0019,
  AVISO_SIN_CAMBIOS,
  AVISO_VENTANA_VENCIDA,
  avisoDeEdicion,
  avisoDeEliminacion,
  CONFIRMACION_ELIMINAR,
  dentroDeLaVentanaDeEdicion,
  idSinGuardar,
  PLACEHOLDER_EDICION,
} from '../lib/mensajes';
import { abrirMenuDeMensaje } from '../lib/menuDeMensaje';
import { AVISO_DE_RECHAZO, chatCerradoParaElConductor } from '../lib/miPostulacion';
import { DireccionPago, montoEnTexto, resumenDePago } from '../lib/pagoServicio';
import { DatosPublicos, datosDesdePerfilPublico, textoParaCopiar } from '../lib/perfilPublico';
import { RootStackParamList } from '../navigation/RootNavigator';
import { Message } from '../types';

type ChatNav = StackNavigationProp<RootStackParamList, 'Chat' | 'Settings'>;
type ChatRoute = RouteProp<RootStackParamList, 'Chat'>;

const EXECUTION_MESSAGES = [
  'Sistema: Conductor en el punto de origen (Ubicado).',
  'Sistema: Viaje iniciado.',
  'Sistema: Viaje finalizado.',
];

/** Sondeo de respaldo por si el tiempo real del proyecto no está activado. */
const SONDEO_MS = 6000;

/**
 * Cuánto se deja ver el cierre del pago antes de salir de la conversación. No es 0
 * para que se alcance a leer "Pagado y cerrado" y no parezca que la app se cayó.
 */
const CIERRE_MS = 3000;

/** Sin acentos ni mayúsculas, para que "vehiculo" encuentre "Vehículo". */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function ChatScreen() {
  const navigation = useNavigation<ChatNav>();
  const route = useRoute<ChatRoute>();
  const { serviceId, driverId, driverName } = route.params;
  const { session } = useAuth();
  const {
    role,
    services,
    applications,
    approveApplication,
    rejectApplicationFrom,
    startProviderChat,
    markDriverSeenChat,
    advanceDriverProgress,
    declararPago,
    resolverDeclaracionDePago,
    confirmarPagoRecibido,
    emitChatNotification,
    refrescar,
    refrescarServicio,
    userProfile,
  } = useMockStore();

  const [input, setInput] = useState('');
  const [mensajes, setMensajes] = useState<ServiceMessage[]>([]);
  const [cargando, setCargando] = useState(true);
  // false = la tabla `service_messages` (migración 0010) no está aplicada: el
  // chat funciona, pero solo en este dispositivo. Se avisa en pantalla.
  const [chatCompartido, setChatCompartido] = useState(true);
  const [buscarAbierto, setBuscarAbierto] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [pagoOcupado, setPagoOcupado] = useState(false);
  // Mensaje que se está reescribiendo (migración 0019) y bloqueo mientras se
  // guarda la edición o el borrado, para no disparar dos veces la misma acción.
  const [mensajeEnEdicion, setMensajeEnEdicion] = useState<ServiceMessage | null>(null);
  const [accionOcupada, setAccionOcupada] = useState(false);
  // false = falta la migración 0019 (editar y eliminar): se avisa en pantalla,
  // igual que se hace cuando falta la 0010.
  const [edicionDisponible, setEdicionDisponible] = useState(true);
  const [datosDelConductor, setDatosDelConductor] = useState<{
    yape?: string;
    bcpAccount?: string;
    bcpCci?: string;
  } | null>(null);
  // Caso A ("Yo pago"): el conductor necesita los medios de pago del proveedor.
  const [datosDelProveedor, setDatosDelProveedor] = useState<{
    yape?: string;
    bcpAccount?: string;
    bcpCci?: string;
    nombre?: string;
  } | null>(null);
  const isAdvancingRef = useRef(false);
  // El aviso de rechazo se muestra UNA vez por visita al chat.
  const rechazoAvisadoRef = useRef(false);
  const flatListRef = useRef<FlatList>(null);

  const service = useMemo(() => services.find((s) => s.id === serviceId), [services, serviceId]);
  const { currentStep, progressIndex } = useServiceProgress(service);

  const userId = session?.user?.id ?? '';
  const mySenderId = userId;
  const effectiveDriverId = driverId ?? service?.assigned_driver_id ?? '';
  // El rol dentro del chat NO puede salir del tab que el usuario tenga abierto:
  // si el proveedor entra con el modo Conductor (o desde otra pantalla) vería la
  // interfaz del conductor y nunca le aparecerían Aceptar / Rechazar. Manda la
  // relación con ESTE servicio; el modo de la app queda solo como respaldo para
  // cuando la fila todavía no llega o el usuario aún no es parte del servicio.
  const soyProveedorDelServicio = !!service && !!userId && service.provider_id === userId;
  const soyConductorAsignado = !!service && !!userId && service.assigned_driver_id === userId;
  const esParteDelServicio = soyProveedorDelServicio || soyConductorAsignado;
  const isDriver = esParteDelServicio ? soyConductorAsignado : role === 'DRIVER';
  const isProvider = esParteDelServicio ? soyProveedorDelServicio : role === 'PROVIDER';
  const otherSenderId = isDriver ? (service?.provider_id ?? '') : effectiveDriverId;
  const isAssigned =
    service?.assigned_driver_id === effectiveDriverId ||
    soyConductorAsignado ||
    (isProvider && !!service?.assigned_driver_id);
  const isEvaluationMode =
    isProvider && service && !isAssigned && service.status !== 'STATUS_COMPLETED';

  /**
   * El proveedor rechazó a este conductor: la conversación se cierra (aviso con
   * "Aceptar" y fuera del chat). La regla vive en `lib/miPostulacion.ts` y la
   * refuerza la base (migración 0017: `is_service_driver` ya no autoriza a una
   * postulación REJECTED).
   */
  const chatCerrado = chatCerradoParaElConductor({
    applications,
    serviceId,
    userId,
    asignadoAMi: soyConductorAsignado,
  });

  /**
   * Marcas locales del conductor (las MISMAS que usa el inicio del conductor): con
   * ellas la franja de esta tarjeta dice lo mismo que la de la pantalla "Todos".
   */
  const [marcasDelConductor, setMarcasDelConductor] = useState<{
    huellas: HuellasDePostulacion;
    inicios: IniciosDelViaje;
  }>({ huellas: {}, inicios: {} });

  useEffect(() => {
    let vigente = true;
    Promise.all([leerHuellasDePostulacion(), leerIniciosDelViaje()]).then(([huellas, inicios]) => {
      if (vigente) setMarcasDelConductor({ huellas, inicios });
    });
    return () => {
      vigente = false;
    };
  }, []);

  /** Mi postulación en este servicio, para la franja (igual que en "Todos"). */
  const miPostulacionEnLaTarjeta = (() => {
    if (!service) return { estado: 'NINGUNA' as const, numero: null, iniciado: false };
    const fila = filaDeMiPostulacion(applications, service.id, effectiveDriverId);
    return {
      estado: estadoEfectivoDeMiPostulacion(
        service,
        fila,
        huellaDeMiPostulacion(marcasDelConductor.huellas, service.id, effectiveDriverId)
      ),
      numero: fila?.order ?? null,
      iniciado: yaInicio(marcasDelConductor.inicios, service.id, effectiveDriverId),
    };
  })();

  /**
   * Datos del conductor para el botón "Copiar datos" (lo usa el proveedor).
   *
   * Antes salían de un objeto de relleno con el nombre de la ruta (`driverName`) y
   * todo lo demás en "-": el texto copiado solo tenía nombres (y ahí iban nombres y
   * apellidos juntos). Ahora se leen del perfil real del conductor: `public_profile`
   * (0005) devuelve `full_name` y `vehicle_data`, y `datosDesdePerfilPublico` parte
   * nombres/apellidos y saca DNI, marca, modelo, color y placa.
   */
  const [perfilDelConductor, setPerfilDelConductor] = useState<DatosPublicos | null>(null);

  useEffect(() => {
    if (!isProvider || !effectiveDriverId) return;
    let vigente = true;
    (async () => {
      try {
        const fila = await fetchProfileById(effectiveDriverId);
        if (vigente) setPerfilDelConductor(datosDesdePerfilPublico(fila));
      } catch (err) {
        console.warn('[chat] no se pudo leer el perfil del conductor:', err);
      }
    })();
    return () => {
      vigente = false;
    };
  }, [isProvider, effectiveDriverId]);

  /**
   * Nombre del PROVEEDOR para el título de la pantalla del conductor.
   *
   * La vía principal es `datos_de_pago_del_proveedor` (0014, campo `nombre`, que ya
   * se lee para los datos de pago); si esa función no está disponible se usa
   * `public_profile` (0005), que autoriza a la contraparte del servicio. Si no
   * llega ninguno, la cabecera pinta el rol ("Proveedor"), nunca un nombre vacío.
   */
  const [nombreDelProveedor, setNombreDelProveedor] = useState('');

  useEffect(() => {
    if (!isDriver || !service?.provider_id) return;
    let vigente = true;
    const proveedorId = service.provider_id;
    (async () => {
      try {
        const fila = await fetchProfileById(proveedorId);
        if (!vigente) return;
        const perfil = datosDesdePerfilPublico(fila);
        setNombreDelProveedor(`${perfil.nombres} ${perfil.apellidos}`.trim());
      } catch (err) {
        console.warn('[chat] no se pudo leer el perfil del proveedor:', err);
      }
    })();
    return () => {
      vigente = false;
    };
  }, [isDriver, service?.provider_id]);

  /** Lo que se copia: el conductor asignado (lo ve el proveedor) o mis propios datos. */
  const datosParaCopiar: DatosPublicos = isDriver
    ? {
        nombres: userProfile?.firstName || '',
        apellidos: userProfile?.lastName || '',
        telefono: userProfile?.phone || '',
        dni: userProfile?.dni || '',
        marca: userProfile?.brand || '',
        modelo: userProfile?.model || '',
        color: userProfile?.color || '',
        placa: userProfile?.plate || '',
        foto: userProfile?.driverPhotoUrl || '',
      }
    : perfilDelConductor || datosDesdePerfilPublico(null);

  // El viaje se reporta con el deslizamiento; al llegar a "Finalizado" esa zona
  // pasa a la interfaz de pago (declaración → aceptación → confirmación). Las dos
  // zonas salen de la MISMA etapa (`etapaDelServicio`): antes cada una tenía su
  // propia condición y llegaron a verse a la vez (el cuadre aparecía un hito antes
  // de tiempo y el formulario del monto se reseteaba solo).
  const showSlider =
    isDriver &&
    isAssigned &&
    !!service &&
    !isEvaluationMode &&
    !chatCerrado &&
    currentStep === 'IN_PROGRESS';
  const showPago =
    !!service && esParteDelServicio && !isEvaluationMode && !chatCerrado && currentStep === 'PAGO';

  const rol: 'CONDUCTOR' | 'PROVEEDOR' = isDriver ? 'CONDUCTOR' : 'PROVEEDOR';

  /**
   * Nombre con el que la app declara la acción ("Sistema: <nombre> editó un
   * mensaje."). Sale del perfil; si el perfil todavía no llegó se declara el rol,
   * nunca una cadena vacía.
   */
  const miNombre = useMemo(() => {
    const nombre = [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(' ').trim();
    return nombre || (isDriver ? 'El conductor' : 'El proveedor');
  }, [userProfile?.firstName, userProfile?.lastName, isDriver]);

  /**
   * Cierre automático al confirmarse el pago (0013): quien recibe el dinero lo
   * confirma y la conversación ya no tiene nada más que hacer. Se deja ver el cierre
   * y se sale a "Mis servicios", donde el servicio queda como "Pagado y cerrado" con
   * su historial de pago.
   *
   * Si al abrir el chat el pago YA estaba confirmado no se cierra solo: en ese caso
   * el usuario está revisando el historial a propósito.
   */
  const pagoConfirmado = !!service && resumenDePago(service).estado === 'CONFIRMADO';
  const yaEstabaConfirmado = useRef(pagoConfirmado);
  const [cierreEnCurso, setCierreEnCurso] = useState(false);

  useEffect(() => {
    if (!pagoConfirmado || yaEstabaConfirmado.current) return;
    setCierreEnCurso(true);
    const temporizador = setTimeout(
      // Se REEMPLAZA la pila: el botón atrás del teléfono tiene que llevar a la
      // pantalla principal, no al chat del servicio ya cerrado (con `navigate`
      // quedaba el chat debajo y el atrás devolvía a una conversación terminada).
      () => navigation.reset({ index: 1, routes: [{ name: 'Main' }, { name: 'MyServices' }] }),
      CIERRE_MS
    );
    return () => clearTimeout(temporizador);
  }, [pagoConfirmado, navigation]);
  // Se leen campos sueltos (no un objeto derivado, que sería nuevo en cada render)
  // para que el efecto de abajo no se dispare en bucle.
  const direccionDePago = service?.pago_direccion ?? null;
  const idDelServicio = service?.id;

  // El proveedor necesita los datos de pago del conductor solo en el caso B
  // ("Me deben"): los trae una función autorizada de la base.
  useEffect(() => {
    if (!isProvider || !idDelServicio) return;
    if (direccionDePago !== 'PROVIDER_PAYS_DRIVER') return;
    let vigente = true;
    (async () => {
      try {
        const datos = await datosDePagoDelConductor(idDelServicio);
        if (vigente) setDatosDelConductor(datos);
      } catch (err) {
        console.warn('[chat] no se pudieron leer los datos de pago del conductor:', err);
      }
    })();
    return () => {
      vigente = false;
    };
  }, [isProvider, idDelServicio, direccionDePago]);

  // Caso A: el conductor ve los medios de pago del proveedor (0014). Se piden
  // desde el principio, no solo tras declarar: el flujo los quiere "siempre
  // visibles" en el paso 1.
  useEffect(() => {
    if (!isDriver || !idDelServicio) return;
    let vigente = true;
    (async () => {
      try {
        const datos = await datosDePagoDelProveedor(idDelServicio);
        if (vigente) setDatosDelProveedor(datos);
      } catch (err) {
        console.warn('[chat] no se pudieron leer los datos de pago del proveedor:', err);
      }
    })();
    return () => {
      vigente = false;
    };
  }, [isDriver, idDelServicio]);

  // ---------------------------------------------------------------- mensajes
  const cargarMensajes = useCallback(
    async (silencioso = false) => {
      if (!effectiveDriverId) {
        setCargando(false);
        return;
      }
      try {
        const lista = await fetchServiceMessages(serviceId, effectiveDriverId);
        setMensajes(lista);
        setChatCompartido(true);
      } catch (err) {
        if (esTablaAusente(err)) {
          setChatCompartido(false);
        } else if (!silencioso) {
          console.warn('[chat] no se pudieron leer los mensajes:', err);
        }
      } finally {
        setCargando(false);
      }
    },
    [serviceId, effectiveDriverId]
  );

  useEffect(() => {
    setCargando(true);
    cargarMensajes();
  }, [cargarMensajes]);

  // Al abrir el chat se relee el servicio de la base: el ciclo de pago
  // (declaración → rechazo → confirmación) cambia en el OTRO dispositivo, así que
  // el estado tiene que estar fresco al entrar y no esperar al respaldo periódico
  // del store ni a que llegue el evento de tiempo real.
  useEffect(() => {
    refrescar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  // ...y mientras el chat está abierto se relee ESA fila cada SONDEO_MS: el
  // rechazo del monto lo escribe el proveedor y el conductor tiene que verlo sin
  // recargar (el sondeo de mensajes de más abajo no toca el estado del pago).
  useEffect(() => {
    if (!serviceId) return;
    const id = setInterval(() => {
      refrescarServicio(serviceId);
    }, SONDEO_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  const agregarSiEsNuevo = useCallback((nuevo: ServiceMessage) => {
    setMensajes((prev) => (prev.some((m) => m.id === nuevo.id) ? prev : [...prev, nuevo]));
  }, []);

  /** El otro lado editó su mensaje (0019): se reemplaza el texto y la marca. */
  const reemplazarSiExiste = useCallback((actualizado: ServiceMessage) => {
    setMensajes((prev) => prev.map((m) => (m.id === actualizado.id ? actualizado : m)));
  }, []);

  /**
   * Alguien borró un mensaje: el evento DELETE no trae la fila completa, así que
   * la conversación se relee (el sondeo de respaldo haría lo mismo en 6 s).
   */
  const releerConversacion = useCallback(() => {
    cargarMensajes(true);
  }, [cargarMensajes]);

  const callbacksTiempoReal = useMemo(
    () => ({
      onMessage: agregarSiEsNuevo,
      onUpdate: reemplazarSiExiste,
      onDelete: releerConversacion,
    }),
    [agregarSiEsNuevo, reemplazarSiExiste, releerConversacion]
  );

  useRealtimeServiceMessages(serviceId, callbacksTiempoReal);

  // Respaldo: si el tiempo real no está activado en el proyecto, los mensajes
  // del otro lado entran igual (cada SONDEO_MS) al reabrir la conversación.
  useEffect(() => {
    if (!chatCompartido) return;
    const id = setInterval(() => cargarMensajes(true), SONDEO_MS);
    return () => clearInterval(id);
  }, [chatCompartido, cargarMensajes]);

  useEffect(() => {
    if (isDriver) {
      markDriverSeenChat(serviceId, effectiveDriverId);
    }
  }, [isDriver, serviceId, effectiveDriverId, markDriverSeenChat]);

  // Conductor rechazado: se avisa UNA vez y el "Aceptar" lo saca del chat. La
  // pantalla queda en solo lectura mientras el aviso está en camino (el campo de
  // escritura ni se pinta).
  useEffect(() => {
    if (!chatCerrado || rechazoAvisadoRef.current) return;
    rechazoAvisadoRef.current = true;
    Alert.alert(AVISO_DE_RECHAZO.titulo, AVISO_DE_RECHAZO.cuerpo, [
      {
        text: AVISO_DE_RECHAZO.boton,
        onPress: () => navigation.goBack(),
      },
    ]);
  }, [chatCerrado, navigation]);

  /** Guarda en la base y deja el mensaje local si la tabla aún no existe. */
  const persistir = async (
    local: ServiceMessage,
    metadata: Record<string, unknown>,
    avisoDelSistema = false
  ) => {
    try {
      const guardado = await insertServiceMessage({
        serviceId,
        driverId: effectiveDriverId,
        senderId: local.sender_id,
        content: local.content,
        type: local.type,
        metadata,
      });
      setMensajes((prev) => prev.map((m) => (m.id === local.id ? guardado : m)));
      setChatCompartido(true);
    } catch (err) {
      if (esTablaAusente(err)) {
        setChatCompartido(false);
      } else {
        Alert.alert(
          avisoDelSistema ? 'No se pudo dejar el aviso del sistema' : 'No se pudo enviar',
          describeError(err)
        );
      }
    }
  };

  const messages: Message[] = useMemo(() => {
    const lista: Message[] = mensajes.map((m) => ({
      id: m.id,
      service_alert_id: m.service_id,
      sender_id: m.sender_id,
      content: m.content,
      // La lista de mensajes solo distingue texto, nota de voz y sistema; las
      // demás clases (foto, ubicación, contacto) se pintan como texto.
      type: m.type === 'VOICE' ? 'VOICE' : m.type === 'SYSTEM' ? 'SYSTEM' : 'TEXT',
      metadata: m.metadata,
      created_at: m.created_at,
      edited_at: m.edited_at ?? null,
    }));

    if (lista.length === 0) {
      if (cargando) return [];
      return [
        {
          id: 'welcome',
          service_alert_id: serviceId,
          sender_id: otherSenderId,
          content: isDriver
            ? 'Hola, tengo algunas consultas sobre mi postulación.'
            : `Hola, me interesa el servicio. Soy ${driverName || 'el conductor'}.`,
          type: 'TEXT' as const,
          metadata: {},
          created_at: new Date().toISOString(),
          sender_name: isDriver ? 'Proveedor' : driverName,
        },
      ];
    }
    return lista;
  }, [mensajes, cargando, serviceId, otherSenderId, driverName, isDriver]);

  // Búsqueda dentro de la conversación (lupa de la cabecera).
  const consultaNormalizada = normalizar(consulta.trim());
  const messagesVisibles = useMemo(() => {
    if (!consultaNormalizada) return messages;
    return messages.filter((m) => normalizar(m.content).includes(consultaNormalizada));
  }, [messages, consultaNormalizada]);

  const addSystemMessage = (content: string, avisoDeAccion = false) => {
    if (!service) return;
    const local: ServiceMessage = {
      id: `sys-${Date.now()}`,
      service_id: serviceId,
      driver_id: effectiveDriverId,
      sender_id: null,
      content,
      type: 'SYSTEM',
      metadata: {},
      created_at: new Date().toISOString(),
      edited_at: null,
    };
    setMensajes((prev) => [...prev, local]);
    if (chatCompartido) {
      persistir(local, {}, avisoDeAccion);
    }
  };

  const handleAccept = () => {
    if (!service) return;
    approveApplication(service.id, effectiveDriverId);
    addSystemMessage('Conductor aceptado. Servicio asignado.');
    emitChatNotification(
      '¡Postulación aceptada!',
      `Fuiste seleccionado para el servicio: ${service.title}. El chat ya está disponible.`,
      { serviceId, driverId: effectiveDriverId, type: 'APPLICATION_ACCEPTED' }
    );
    Alert.alert('Conductor aceptado', 'El servicio ha sido asignado.');
  };

  const handleReject = () => {
    if (!service) return;
    // Solo a este conductor: `rejectApplication` (sin conductor) descarta todas
    // las postulaciones del servicio, que no es lo que el proveedor quiere aquí.
    rejectApplicationFrom(service.id, effectiveDriverId);
    addSystemMessage('Postulación rechazada.');
    Alert.alert('Postulación rechazada', 'El conductor ha sido descartado.');
    navigation.goBack();
  };

  const handleStepAdvance = async () => {
    if (!service || isAdvancingRef.current) return;
    if ((service.driver_progress_step ?? 0) >= ULTIMO_HITO_VIAJE) {
      // El viaje ya está reportado como finalizado: sigue el pago, no el reporte.
      Alert.alert('Viaje ya reportado', 'El servicio ya figura como finalizado.');
      return;
    }
    isAdvancingRef.current = true;
    setTimeout(() => {
      isAdvancingRef.current = false;
    }, 700);

    if (progressIndex < 0 || progressIndex > 2) return;

    // Primero se guarda en la base (el conductor con la RPC de la 0012) y solo
    // entonces se anuncia el hito: así el proceso no se queda en bucle ni
    // reaparece al recargar. El paso que vale es el que confirmó la base.
    const paso = await advanceDriverProgress(service.id);
    if (paso === null) return;

    const mensaje = EXECUTION_MESSAGES[Math.min(paso - 1, EXECUTION_MESSAGES.length - 1)];
    addSystemMessage(mensaje);
    emitChatNotification('Hito del viaje', mensaje.replace('Sistema: ', ''));
  };

  // ------------------------------------------------------------------- pago
  /** El conductor declara "Yo pago" / "Me deben" con el monto. */
  const handleDeclararPago = async (direccion: DireccionPago, monto: number) => {
    if (!service) return;
    setPagoOcupado(true);
    const guardado = await declararPago(service.id, direccion, monto);
    setPagoOcupado(false);
    if (!guardado) return;

    addSystemMessage(
      direccion === 'DRIVER_PAYS_PROVIDER'
        ? `Sistema: El conductor declara que le debe ${montoEnTexto(monto)} al proveedor.`
        : `Sistema: El conductor declara que el proveedor le debe ${montoEnTexto(monto)}.`
    );
    emitChatNotification(
      'Monto declarado',
      direccion === 'DRIVER_PAYS_PROVIDER'
        ? `El conductor declara que te debe ${montoEnTexto(monto)}`
        : `El conductor declara que le debes ${montoEnTexto(monto)}`
    );
  };

  /** El proveedor acepta o rechaza el monto declarado. */
  const handleResolverDeclaracion = async (aceptar: boolean) => {
    if (!service) return;
    setPagoOcupado(true);
    const guardado = await resolverDeclaracionDePago(service.id, aceptar);
    setPagoOcupado(false);
    if (!guardado) return;

    addSystemMessage(
      aceptar
        ? 'Sistema: El proveedor aceptó el monto. Pago en camino.'
        : 'Sistema: El proveedor rechazó el monto. El conductor debe corregirlo.'
    );
    emitChatNotification(
      aceptar ? 'Monto aceptado' : 'Monto rechazado',
      aceptar ? 'El pago está en camino.' : 'Corrige el monto y vuelve a declararlo.'
    );
  };

  /** Confirma el pago recibido: solo quien recibe el dinero. */
  const handleConfirmarPago = async () => {
    if (!service) return;
    setPagoOcupado(true);
    const guardado = await confirmarPagoRecibido(service.id);
    setPagoOcupado(false);
    if (!guardado) return;

    addSystemMessage('Sistema: Pago confirmado. Servicio pagado y cerrado.');
    emitChatNotification('Pago confirmado', 'El servicio quedó pagado y cerrado.');
  };

  const handleSend = (content: string, type: 'TEXT' | 'VOICE' = 'TEXT') => {
    const texto = content.trim();
    if (!texto || !service) return;
    // Conductor rechazado: no se escribe en una conversación cerrada (el campo de
    // escritura tampoco se pinta; esto es la red de seguridad).
    if (chatCerrado) return;
    if (isProvider) {
      startProviderChat(serviceId, effectiveDriverId);
    }

    const metadata: Record<string, unknown> = type === 'VOICE' ? { duration: 3 } : {};
    const local: ServiceMessage = {
      id: `msg-${Date.now()}`,
      service_id: serviceId,
      driver_id: effectiveDriverId,
      sender_id: mySenderId || null,
      content: texto,
      type,
      metadata,
      created_at: new Date().toISOString(),
      edited_at: null,
    };

    setMensajes((prev) => [...prev, local]);
    setInput('');
    emitChatNotification(
      isDriver ? 'Nuevo mensaje del conductor' : 'Nuevo mensaje del proveedor',
      texto
    );
    persistir(local, metadata);
  };

  const handleSendVoice = () => {
    setTimeout(() => {
      handleSend('🎤 Nota de voz (0:03)', 'VOICE');
      Alert.alert('Nota de voz', 'Enviada nota de voz de 3 segundos.');
    }, 800);
  };

  const handleAttachment = (type: AttachmentType) => {
    const labels: Record<AttachmentType, string> = {
      photo: '🖼️ Foto',
      camera: '📷 Cámara',
      location: '📍 Ubicación',
      contact: '👤 Contacto',
    };
    handleSend(labels[type], 'TEXT');
  };

  // ------------------------------------------------- editar / eliminar mensajes
  /**
   * Menú de acciones de un mensaje PROPIO (migración 0019).
   *
   * Solo se llega aquí desde las burbujas propias: los mensajes del sistema, los
   * del otro y los que todavía se están enviando no tienen acciones.
   */
  const handleAccionesDeMensaje = (mensaje: Message) => {
    if (!edicionDisponible) {
      Alert.alert('Editar y eliminar', AVISO_MIGRACION_0019);
      return;
    }
    const fila = mensajes.find((m) => m.id === mensaje.id);
    if (!fila) return;
    if (idSinGuardar(fila.id)) {
      Alert.alert('Un momento', AVISO_MENSAJE_ENVIANDO);
      return;
    }
    abrirMenuDeMensaje({
      created_at: fila.created_at,
      alEditar: () => handleEmpezarEdicion(fila),
      alEliminar: () => handleConfirmarEliminacion(fila),
    });
  };

  /** Pasa el mensaje a la barra de escritura (modo edición). */
  const handleEmpezarEdicion = (mensaje: ServiceMessage) => {
    setMensajeEnEdicion(mensaje);
    setInput(mensaje.content);
  };

  const handleCancelarEdicion = () => {
    setMensajeEnEdicion(null);
    setInput('');
  };

  /**
   * Guarda el texto nuevo y DESPUÉS declara la edición: nunca se declara una
   * edición que no llegó a guardarse. Lo que decía el mensaje antes no se guarda
   * ni se muestra: solo queda la marca "editado".
   */
  const handleGuardarEdicion = async () => {
    const mensaje = mensajeEnEdicion;
    if (!mensaje || accionOcupada) return;
    const texto = input.trim();
    if (!texto) return;

    // La ventana se vuelve a comprobar aquí: pudo vencer mientras se escribía.
    if (!dentroDeLaVentanaDeEdicion(mensaje)) {
      handleCancelarEdicion();
      Alert.alert('No se puede editar', AVISO_VENTANA_VENCIDA);
      return;
    }
    // Sin cambios no hay edición que declarar.
    if (texto === mensaje.content) {
      handleCancelarEdicion();
      Alert.alert('Sin cambios', AVISO_SIN_CAMBIOS);
      return;
    }

    setAccionOcupada(true);
    try {
      const guardado = chatCompartido ? await updateServiceMessage(mensaje.id, texto) : null;
      if (chatCompartido && !guardado) {
        // La base no dejó tocar la fila: no es mía, es del sistema o venció la
        // ventana. Se relee la conversación para quedar como está en la base.
        cargarMensajes(true);
        Alert.alert('No se pudo editar', AVISO_VENTANA_VENCIDA);
        return;
      }
      const marca = guardado?.edited_at ?? new Date().toISOString();
      setMensajes((prev) =>
        prev.map((m) => (m.id === mensaje.id ? { ...m, content: texto, edited_at: marca } : m))
      );
      handleCancelarEdicion();
      addSystemMessage(avisoDeEdicion(miNombre), true);
    } catch (err) {
      if (esEdicionSinMigracion(err)) {
        setEdicionDisponible(false);
        Alert.alert('Editar y eliminar', AVISO_MIGRACION_0019);
      } else {
        Alert.alert('No se pudo editar', describeError(err));
      }
    } finally {
      setAccionOcupada(false);
    }
  };

  const handleConfirmarEliminacion = (mensaje: ServiceMessage) => {
    Alert.alert('Eliminar mensaje', CONFIRMACION_ELIMINAR, [
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => handleEliminarMensaje(mensaje),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  /**
   * Borra el mensaje de la base y deja SOLO el aviso del sistema. Si la base no
   * borró nada (no es mío, es del sistema o ya no estaba) no se declara nada.
   */
  const handleEliminarMensaje = async (mensaje: ServiceMessage) => {
    if (accionOcupada) return;
    setAccionOcupada(true);
    try {
      if (chatCompartido) {
        const borrado = await deleteServiceMessage(mensaje.id);
        if (!borrado) {
          cargarMensajes(true);
          Alert.alert('No se pudo eliminar', 'El mensaje ya no estaba en la conversación.');
          return;
        }
      }
      setMensajes((prev) => prev.filter((m) => m.id !== mensaje.id));
      if (mensajeEnEdicion?.id === mensaje.id) handleCancelarEdicion();
      addSystemMessage(avisoDeEliminacion(miNombre), true);
    } catch (err) {
      if (esEdicionSinMigracion(err)) {
        setEdicionDisponible(false);
        Alert.alert('Editar y eliminar', AVISO_MIGRACION_0019);
      } else {
        Alert.alert('No se pudo eliminar', describeError(err));
      }
    } finally {
      setAccionOcupada(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert('Copiado', text);
    } catch {
      Alert.alert('Error', 'No se pudo copiar al portapapeles');
    }
  };

  const handleCopyBank = (_label: string, value: string) => {
    copyToClipboard(value);
  };

  const handleCopyData = async () => {
    await copyToClipboard(textoParaCopiar(datosParaCopiar));
  };

  const renderHeader = () => (
    <>
      <Text style={styles.dateText}>
        {new Date(service!.created_at).toLocaleDateString('es-PE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })}
      </Text>
      {/* La tarjeta del chat es la MISMA que la del inicio del conductor (estructura y
          orden), con un pie debajo de la franja: el botón azul de navegación para el
          conductor y, para el proveedor, los datos a copiar. */}
      <ServiceCard
        service={service!}
        disableSwipe
        vista={isProvider ? 'PROVEEDOR' : 'CONDUCTOR'}
        miPostulacion={isDriver ? miPostulacionEnLaTarjeta : undefined}
        pie={
          <>
            {isDriver && isAssigned && currentStep === 'IN_PROGRESS' && (
              <BotonDeNavegacion service={service!} conductor={effectiveDriverId} />
            )}
            {isProvider && currentStep === 'IN_PROGRESS' && (
              <View style={styles.copyDataRow}>
                <TouchableOpacity
                  style={styles.copyDataBtn}
                  onPress={handleCopyData}
                  activeOpacity={0.85}
                >
                  <Text style={styles.copyDataBtnText}>Copiar datos</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        }
      />
    </>
  );

  if (!service) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.emptyText}>Servicio no encontrado</Text>
      </SafeAreaView>
    );
  }

  /**
   * Salir del chat.
   *
   * Con conductor ya asignado se vuelve a la pantalla PRINCIPAL: el proveedor llega
   * aquí desde "Postulantes" (para aceptar), así que un `goBack` lo devolvía al
   * listado de postulantes de un servicio que ya tiene conductor —lo pidió el
   * usuario—. Para el conductor aceptado vale lo mismo (su viaje ya está en el
   * inicio, con la franja verde).
   */
  const handleBack = () => {
    if (service.assigned_driver_id) {
      navigation.navigate('Main');
      return;
    }
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ChatHeader
          title={nombreDeLaContraparte(isDriver, {
            nombreProveedor: datosDelProveedor?.nombre || nombreDelProveedor,
            nombreConductor: perfilDelConductor
              ? `${perfilDelConductor.nombres} ${perfilDelConductor.apellidos}`.trim()
              : driverName,
          })}
          subtitle={rolDeLaContraparte(isDriver)}
          onBack={handleBack}
          onSettings={() => navigation.navigate('Settings')}
          searchOpen={buscarAbierto}
          query={consulta}
          onChangeQuery={setConsulta}
          onToggleSearch={() => {
            setBuscarAbierto((abierto) => !abierto);
            setConsulta('');
          }}
          resultCount={messagesVisibles.length}
        />

        {isEvaluationMode && <EvaluationBar onAccept={handleAccept} onReject={handleReject} />}

        {showSlider ? (
          <SwipeStatusButton progressIndex={progressIndex} onAdvance={handleStepAdvance} />
        ) : isProvider && isAssigned && currentStep === 'IN_PROGRESS' && service ? (
          <ProviderStatusBar service={service} />
        ) : null}

        {/* Zona de pago: aparece cuando el viaje ya terminó y la ve cada rol
            según el ciclo (declaración, aceptación/rechazo, confirmación). */}
        {showPago && service && (
          <PagoDelServicio
            service={service}
            rol={rol}
            misDatos={{
              yapeNumber: userProfile?.yapeNumber,
              bcpAccount: userProfile?.bcpAccount,
              bcpCci: userProfile?.bcpCci,
            }}
            datosDelConductor={datosDelConductor}
            datosDelProveedor={datosDelProveedor}
            cerrando={cierreEnCurso}
            ocupado={pagoOcupado}
            onDeclarar={handleDeclararPago}
            onResolver={handleResolverDeclaracion}
            onConfirmar={handleConfirmarPago}
            onCopiar={handleCopyBank}
          />
        )}

        {cargando ? (
          <View style={styles.centro}>
            <ActivityIndicator color="#3F51B5" />
          </View>
        ) : (
          <MessageList
            messages={messagesVisibles}
            mySenderId={mySenderId}
            listRef={flatListRef}
            onActions={chatCerrado ? undefined : handleAccionesDeMensaje}
            ListHeaderComponent={
              consultaNormalizada ? (
                <Text style={styles.avisoBusqueda}>
                  {messagesVisibles.length === 0
                    ? 'Sin mensajes que coincidan con la búsqueda.'
                    : `${messagesVisibles.length} de ${messages.length} mensajes`}
                </Text>
              ) : (
                renderHeader
              )
            }
          />
        )}

        {!chatCompartido && (
          <View style={styles.aviso}>
            <Text style={styles.avisoTexto}>
              Chat solo en este dispositivo: aplica la migración 0010
              (supabase/migrations/0010_service_messages.sql) en Supabase Studio para que el
              conductor y el proveedor se vean los mensajes.
            </Text>
          </View>
        )}

        {!edicionDisponible && (
          <View style={styles.aviso}>
            <Text style={styles.avisoTexto}>{AVISO_MIGRACION_0019}</Text>
          </View>
        )}

        {chatCerrado ? (
          <View style={styles.cerrado}>
            <Text style={styles.cerradoTexto}>
              Conversación cerrada: tu postulación fue rechazada. Si el servicio sigue disponible en
              tus grupos puedes volver a postularte.
            </Text>
          </View>
        ) : (
          <ChatInputBar
            value={input}
            onChangeText={setInput}
            onSend={mensajeEnEdicion ? handleGuardarEdicion : () => handleSend(input)}
            onSendVoice={handleSendVoice}
            onAttachment={handleAttachment}
            editando={!!mensajeEnEdicion}
            onCancelarEdicion={handleCancelarEdicion}
            placeholder={mensajeEnEdicion ? PLACEHOLDER_EDICION : undefined}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  flex: {
    flex: 1,
  },
  centro: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 12,
    marginVertical: 10,
  },
  /** Pie de la tarjeta del servicio: los botones van centrados. */
  copyDataRow: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 12,
  },
  copyDataBtn: {
    backgroundColor: AZUL,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 28,
    minWidth: 180,
    alignItems: 'center',
  },
  copyDataBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  avisoBusqueda: {
    textAlign: 'center',
    color: '#555',
    fontSize: 12,
    marginVertical: 10,
  },
  aviso: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cerrado: {
    backgroundColor: '#F2F2F2',
    borderTopWidth: 0.5,
    borderTopColor: '#DDDDDD',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cerradoTexto: {
    color: '#555555',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  avisoTexto: {
    color: '#E65100',
    fontSize: 11,
    lineHeight: 15,
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 40,
  },
});
