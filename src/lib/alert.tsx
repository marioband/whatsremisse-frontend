import React, { useEffect, useState } from 'react';
import {
  Alert as NativeAlert,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export interface AlertButton {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface AlertRequest {
  title: string;
  message?: string;
  buttons: AlertButton[];
}

/**
 * El `Alert` de react-native-web (0.19) es una función vacía: en el navegador
 * ningún aviso ni confirmación se ve, y los errores parecen "no hacer nada".
 *
 * Este módulo expone la misma API (`Alert.alert(titulo, mensaje, botones)`) pero
 * en web usa `window.alert`/`window.confirm` para uno o dos botones y pinta una
 * hoja de acciones dentro de la app (AlertHost, montado en RootNavigator) para
 * tres o más. En nativo delega en el Alert de React Native.
 */
let listener: ((request: AlertRequest) => void) | null = null;

function formatText(title: string, message?: string) {
  return [title, message].filter((part) => !!part).join('\n\n');
}

function webAlert(title: string, message: string | undefined, buttons: AlertButton[]) {
  if (buttons.length <= 1) {
    window.alert(formatText(title, message));
    buttons[0]?.onPress?.();
    return;
  }

  if (buttons.length === 2) {
    const cancel = buttons.find((button) => button.style === 'cancel');
    if (cancel) {
      const accept = buttons.find((button) => button !== cancel);
      if (window.confirm(formatText(title, message))) accept?.onPress?.();
      else cancel.onPress?.();
      return;
    }
  }

  listener?.({ title, message, buttons });
}

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]) {
    if (Platform.OS !== 'web') {
      NativeAlert.alert(title, message, buttons);
      return;
    }
    webAlert(title, message, buttons ?? []);
  },
};

/** Avisos de tres o más botones en web. Se monta una sola vez, en RootNavigator. */
export function AlertHost() {
  const [request, setRequest] = useState<AlertRequest | null>(null);

  useEffect(() => {
    listener = setRequest;
    return () => {
      listener = null;
    };
  }, []);

  if (!request) return null;

  const close = (button?: AlertButton) => {
    setRequest(null);
    button?.onPress?.();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => close()}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{request.title}</Text>
          {!!request.message && <Text style={styles.message}>{request.message}</Text>}
          {request.buttons.map((button, index) => (
            <TouchableOpacity
              key={`${button.text ?? 'accion'}-${index}`}
              style={styles.button}
              onPress={() => close(button)}
            >
              <Text
                style={[
                  styles.buttonText,
                  button.style === 'destructive' && styles.destructive,
                  button.style === 'cancel' && styles.cancel,
                ]}
              >
                {button.text ?? 'Aceptar'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111',
    textAlign: 'center',
  },
  message: {
    marginTop: 8,
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
  },
  button: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3F51B5',
  },
  destructive: {
    color: '#9B3B43',
  },
  cancel: {
    color: '#666',
  },
});
