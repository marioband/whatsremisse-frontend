import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Text,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  FlatList,
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
import { useServiceProgress } from '../hooks/useServiceProgress';
import { RootStackParamList } from '../navigation/RootNavigator';

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

export function ChatScreen() {
  const navigation = useNavigation<ChatNav>();
  const route = useRoute<ChatRoute>();
  const { serviceId, driverId, driverName } = route.params;
  const { session } = useAuth();
  const {
    role,
    services,
    chats,
    addMessage,
    approveApplication,
    rejectApplication,
    updateServiceStatus,
    payCommission,
    confirmDriverPayment,
    startProviderChat,
    markDriverSeenChat,
    enableSettlement,
    advanceDriverProgress,
    emitChatNotification,
    userProfile,
  } = useMockStore();

  const [input, setInput] = useState('');
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

  useEffect(() => {
    if (isDriver) {
      markDriverSeenChat(serviceId, effectiveDriverId);
    }
  }, [isDriver, serviceId, effectiveDriverId, markDriverSeenChat]);

  const messages = useMemo(() => {
    const list = chats[serviceId] || [];
    if (list.length === 0) {
      return [
        {
          id: 'welcome',
          service_alert_id: serviceId,
          sender_id: otherSenderId,
          content: isDriver
            ? 'Hola, tengo algunas consultas sobre tu postulación.'
            : `Hola, me interesa el servicio. Soy ${driverName || 'el conductor'}.`,
          type: 'TEXT' as const,
          metadata: {},
          created_at: new Date().toISOString(),
          sender_name: isDriver ? 'Proveedor' : driverName,
        },
      ];
    }
    return list;
  }, [chats, serviceId, otherSenderId, driverName, isDriver]);

  const addSystemMessage = (content: string) => {
    if (!service) return;
    addMessage(serviceId, {
      id: `sys-${Date.now()}`,
      service_alert_id: serviceId,
      sender_id: null,
      content,
      type: 'SYSTEM',
      metadata: {},
      created_at: new Date().toISOString(),
    });
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
    rejectApplication(service.id);
    addSystemMessage('Postulación rechazada.');
    Alert.alert('Postulación rechazada', 'El conductor ha sido descartado.');
    navigation.goBack();
  };

  const handleStepAdvance = () => {
    if (!service || isAdvancingRef.current) return;
    isAdvancingRef.current = true;
    setTimeout(() => {
      isAdvancingRef.current = false;
    }, 500);

    if (currentStep === 'IN_PROGRESS') {
      if (progressIndex < 0 || progressIndex > 2) return;

      advanceDriverProgress(service.id);
      addSystemMessage(EXECUTION_MESSAGES[progressIndex]);
      emitChatNotification(
        'Hito del viaje',
        EXECUTION_MESSAGES[progressIndex].replace('Sistema: ', '')
      );

      if (progressIndex === 1) {
        updateServiceStatus(service.id, 'STATUS_IN_PROGRESS');
      } else if (progressIndex === 2) {
        updateServiceStatus(service.id, 'STATUS_COMPLETED');
        enableSettlement(service.id);
      }
    } else if (currentStep === 'COMMISSION_PAID') {
      payCommission(service.id);
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
      confirmDriverPayment(service.id);
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
    if (!content.trim() || !service) return;
    if (isProvider) {
      startProviderChat(serviceId, effectiveDriverId);
    }
    addMessage(serviceId, {
      id: `msg-${Date.now()}`,
      service_alert_id: serviceId,
      sender_id: mySenderId,
      content: content.trim(),
      type,
      metadata: type === 'VOICE' ? { duration: 3 } : {},
      created_at: new Date().toISOString(),
      sender_name: isDriver ? userProfile?.firstName || 'Conductor' : 'Proveedor',
    });
    emitChatNotification(
      isDriver ? 'Nuevo mensaje del conductor' : 'Nuevo mensaje del proveedor',
      content.trim()
    );
    setInput('');
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
        />

        {isEvaluationMode && <EvaluationBar onAccept={handleAccept} onReject={handleReject} />}

        {showSlider ? (
          <SwipeStatusButton
            role="DRIVER"
            step={currentStep}
            progressIndex={progressIndex}
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

        <MessageList
          messages={messages}
          mySenderId={mySenderId}
          listRef={flatListRef}
          ListHeaderComponent={renderHeader}
        />

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
  dateText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 12,
    marginVertical: 10,
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 40,
  },
});
