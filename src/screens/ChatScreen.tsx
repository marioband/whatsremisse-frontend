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
  ProviderStatusBar,
  ServiceSummaryCard,
  SettlementPanel,
} from '../components/chat';
import { useAuth } from '../context/AuthContext';
import { useMockStore } from '../context/MockStoreContext';
import { useRealtimeServiceMessages } from '../hooks/useRealtimeServiceMessages';
import { useServiceProgress } from '../hooks/useServiceProgress';
import { Alert } from '../lib/alert';
import {
  esTablaAusente,
  fetchServiceMessages,
  insertServiceMessage,
  ServiceMessage,
} from '../lib/database';
import { describeError } from '../lib/errors';
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

/** Último hito del viaje: después de este ya no hay nada que reportar. */
const ULTIMO_HITO = 3;
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
    payCommission,
    confirmDriverPayment,
    startProviderChat,
    markDriverSeenChat,
    advanceDriverProgress,
    emitChatNotification,
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
  const isAdvancingRef = useRef(false);
  const flatListRef = useRef<FlatList>(null);

  const service = useMemo(() => services.find((s) => s.id === serviceId), [services, serviceId]);
  const { currentStep, progressIndex } = useServiceProgress(service);

  const userId = session?.user?.id ?? '';
  const isDriver = role === 'DRIVER';
  const isProvider = role === 'PROVIDER';
  const mySenderId = userId;
  const effectiveDriverId = driverId ?? service?.assigned_driver_id ?? '';
  const otherSenderId = isDriver ? (service?.provider_id ?? '') : effectiveDriverId;
  const isAssigned = service?.assigned_driver_id === effectiveDriverId;
  const isEvaluationMode =
    isProvider && service && !isAssigned && service.status !== 'STATUS_COMPLETED';
  const sinMasHitos =
    currentStep === 'IN_PROGRESS' && (service?.driver_progress_step ?? 0) >= ULTIMO_HITO;

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

  const showSlider = isDriver && isAssigned && service && !isEvaluationMode;
  const showSettlement =
    service &&
    service.settlement_enabled &&
    (currentStep === 'COMMISSION_PAID' || currentStep === 'PAYMENT_RECEIVED');

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
    if (currentStep === 'IN_PROGRESS' && (service.driver_progress_step ?? 0) >= ULTIMO_HITO) {
      // El viaje ya está reportado como finalizado: no se repite el hito.
      Alert.alert('Viaje ya reportado', 'El servicio ya figura como finalizado.');
      return;
    }
    isAdvancingRef.current = true;
    setTimeout(() => {
      isAdvancingRef.current = false;
    }, 700);

    if (currentStep === 'IN_PROGRESS') {
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
    } else if (currentStep === 'COMMISSION_PAID') {
      const guardado = await payCommission(service.id);
      if (!guardado) return;
      addSystemMessage(
        isDriver
          ? 'Sistema: Comisión entregada al proveedor.'
          : 'Sistema: Comisión recibida del conductor.'
      );
      emitChatNotification(
        'Cuadre financiero',
        isDriver ? 'Comisión entregada al proveedor.' : 'Comisión recibida del conductor.'
      );
    } else if (currentStep === 'PAYMENT_RECEIVED') {
      const guardado = await confirmDriverPayment(service.id);
      if (!guardado) return;
      addSystemMessage(
        isDriver
          ? 'Sistema: Pago recibido. Servicio cerrado.'
          : 'Sistema: Abonado al conductor. Servicio cerrado.'
      );
      emitChatNotification(
        'Servicio cerrado',
        isDriver ? 'Pago recibido. Servicio cerrado.' : 'Abonado al conductor. Servicio cerrado.'
      );
    }
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
            step={currentStep}
            progressIndex={progressIndex}
            disabled={sinMasHitos}
            onAdvance={handleStepAdvance}
          />
        ) : isProvider && isAssigned ? (
          <ProviderStatusBar service={service} />
        ) : null}

        {showSettlement && (
          <SettlementPanel
            service={service}
            userProfile={userProfile ?? undefined}
            onCopy={handleCopyBank}
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
