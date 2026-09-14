import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const HIGH_PRIORITY_CHANNEL_ID = 'whatsremisse-high-priority';

/**
 * Configura el manejador de notificaciones en primer plano y el canal
 * de alta prioridad en Android para que suenen/vibren incluso con el
 * celular bloqueado o la app abierta.
 */
export async function initNotifications(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
        allowDisplayInCarPlay: false,
        allowCriticalAlerts: true,
      },
    });
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Permiso de notificaciones no concedido');
    return;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(HIGH_PRIORITY_CHANNEL_ID, {
      name: 'Alertas críticas de WhatsRemisse',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 200, 500],
      sound: 'default',
      enableLights: true,
      lightColor: '#3F51B5',
      showBadge: true,
      bypassDnd: true,
    });
  }
}

/**
 * Envía una notificación local de alta prioridad con sonido y vibración.
 * En Android se vincula al canal HIGH_PRIORITY_CHANNEL_ID para heads-up.
 */
export async function notifyHighPriority(
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: data ?? {},
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
      badge: 1,
      ...(Platform.OS === 'ios'
        ? {
            interruptionLevel: 'timeSensitive' as any,
          }
        : {}),
    },
    trigger: null, // inmediata
  });
}

/**
 * Obtiene el token de Expo Push para enviar notificaciones remotas desde
 * Supabase / un backend. Se usa cuando haya credenciales de FCM/APNs.
 */
export async function getExpoPushToken(): Promise<string | null> {
  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    return token;
  } catch (err) {
    console.warn('No se pudo obtener Expo Push Token:', err);
    return null;
  }
}
