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
  View,
} from 'react-native';

import { ChatInputBar, AttachmentType } from '../components/ChatInputBar';
import { SwipeStatusButton } from '../components/SwipeStatusButton';
import {
  ChatHeader,
  EvaluationBar,
  MessageList,
  PagoDelServicio,
  ProviderStatusBar,
  ServiceSummaryCard,
} from '../components/chat';
import { useAuth } from '../context/AuthContext';
import { useMockStore } from '../context/MockStoreContext';
import { useRealtimeServiceMessages } from '../hooks/useRealtimeServiceMessages';
import { ULTIMO_HITO_VIAJE, useServiceProgress } from '../hooks/useServiceProgress';
import { Alert } from '../lib/alert';
import {
  datosDePagoDelConductor,
  datosDePagoDelProveedor,
  esTablaAusente,
  fetchServiceMessages,
  insertServiceMessage,
  ServiceMessage,
} from '../lib/database';
import { describeError } from '../lib/errors';
import { DireccionPago, montoEnTexto } from '../lib/pagoServicio';
import { RootStackParamList } from '../navigation/RootNavigator';
import { Message } from '../types';

type ChatNav = StackNavigationProp<RootStackParamList, 'Chat' | 'Settings'>;
type ChatRoute = RouteProp<RootStackParamList, 'Chat'>;

interface DriverProfile {
  firstName: string;
  lastName: string;
  dni: string;
  phone: string;
  brand: string;
  model: string;
  color: string;
  plate: string;
}

const EXECUTION_MESSAGES = [
  'Sistema: Conductor en el punto de origen (Ubicado).',
  'Sistema: Viaje iniciado.',
  'Sistema: Viaje finalizado.',
];

/** Sondeo de respaldo por si el tiempo real del proyecto no está activado. */
const SONDEO_MS = 6000;

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

  const profile: DriverProfile = useMemo(
    () => ({
      firstName: driverName || 'Conductor',
      lastName: '',
      dni: '-',
      phone: '-',
      brand: '-',
      model: '-',
      color: '-',
      plate: '-',
    }),
    [driverName]
  );

  // El viaje se reporta con el deslizamiento; al llegar a "Finalizado" esa zona
  // pasa a la interfaz de pago (declaración → aceptación → confirmación).
  const showSlider =
    isDriver && isAssigned && service && !isEvaluationMode && currentStep === 'IN_PROGRESS';
  // El cierre del viaje llega por dos señales equivalentes (0012 escribe las dos:
  // driver_progress_step = 3 y status = STATUS_COMPLETED). Basta con una para que
  // la zona de pago aparezca en los DOS dispositivos.
  const viajeTerminado =
    currentStep === 'PAGO' ||
    (!!service &&
      (service.status === 'STATUS_COMPLETED' ||
        (service.driver_progress_step ?? 0) >= ULTIMO_HITO_VIAJE));
  const showPago = !!service && esParteDelServicio && viajeTerminado && !isEvaluationMode;

  const rol: 'CONDUCTOR' | 'PROVEEDOR' = isDriver ? 'CONDUCTOR' : 'PROVEEDOR';
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

  const agregarSiEsNuevo = useCallback((nuevo: ServiceMessage) => {
    setMensajes((prev) => (prev.some((m) => m.id === nuevo.id) ? prev : [...prev, nuevo]));
  }, []);

  useRealtimeServiceMessages(serviceId, agregarSiEsNuevo);

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

  /** Guarda en la base y deja el mensaje local si la tabla aún no existe. */
  const persistir = async (local: ServiceMessage, metadata: Record<string, unknown>) => {
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
        Alert.alert('No se pudo enviar', describeError(err));
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

  const addSystemMessage = (content: string) => {
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
    };
    setMensajes((prev) => [...prev, local]);
    if (chatCompartido) {
      persistir(local, {});
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
    // reaparece al recargar.
    const guardado = await advanceDriverProgress(service.id);
    if (!guardado) return;

    addSystemMessage(EXECUTION_MESSAGES[progressIndex]);
    emitChatNotification(
      'Hito del viaje',
      EXECUTION_MESSAGES[progressIndex].replace('Sistema: ', '')
    );
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
    const text = `Datos del Conductor
=====================
Nombres: ${profile.firstName}
Apellidos: ${profile.lastName}
DNI: ${profile.dni}

Datos del Vehículo
=====================
Marca: ${profile.brand}
Modelo: ${profile.model}
Color: ${profile.color}
Placa: ${profile.plate}`;

    await copyToClipboard(text);
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
      <ServiceSummaryCard
        service={service!}
        isProvider={isProvider}
        showCopyData={isProvider && currentStep === 'IN_PROGRESS'}
        onCopyData={handleCopyData}
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

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ChatHeader
          title={service.title || 'Chat'}
          subtitle={isDriver ? 'Proveedor' : 'Conductor'}
          onBack={() => navigation.goBack()}
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
          <SwipeStatusButton
            role="DRIVER"
            step="IN_PROGRESS"
            progressIndex={progressIndex}
            onAdvance={handleStepAdvance}
          />
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

        <ChatInputBar
          value={input}
          onChangeText={setInput}
          onSend={() => handleSend(input)}
          onSendVoice={handleSendVoice}
          onAttachment={handleAttachment}
        />
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
