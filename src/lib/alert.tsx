import React, { useEffect, useState } from 'react';
import {
  Alert as NativeAlert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';

import {
  AZUL,
  BLANCO,
  ESPACIADO,
  FONDO_TARJETA,
  INTERLINEADO,
  PESO,
  RADIOS,
  ROJO_ACCION,
  TALLAS,
  TEXTO,
  TEXTO_SUAVE,
  TEXTO_TENUE,
  VELO_MODAL,
} from './diseno';

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
 * El `Alert` de react-native-web (0.19) es una función vacía: en el navegador ningún
 * aviso ni confirmación se ve, y los errores parecen "no hacer nada".
 *
 * Este módulo expone la misma API (`Alert.alert(titulo, mensaje, botones)`) pero en web
 * TODOS los avisos van por la hoja propia dentro de la app (AlertHost, montado en
 * RootNavigator). Hasta el 10-10-2026 los avisos de uno y dos botones salían como cuadros
 * del navegador (`window.alert` / `window.confirm`): rompían la identidad visual y no se
 * pueden pintar; ya no se usan. En nativo delega en el Alert de React Native.
 */
let listener: ((request: AlertRequest) => void) | null = null;

function formatText(title: string, message?: string) {
  return [title, message].filter((part) => !!part).join('\n\n');
}

function webAlert(title: string, message: string | undefined, buttons: AlertButton[]) {
  const lista = buttons.length > 0 ? buttons : [{ text: 'Aceptar' }];

  if (listener) {
    listener({ title, message, buttons: lista });
    return;
  }

  // Sin la hoja montada (fuera de la app: una prueba, un módulo suelto) el aviso no se
  // pierde en silencio: último recurso del navegador.
  if (lista.length === 2) {
    const cancelar = lista.find((button) => button.style === 'cancel');
    if (cancelar) {
      const aceptar = lista.find((button) => button !== cancelar);
      if (window.confirm(formatText(title, message))) aceptar?.onPress?.();
      else cancelar.onPress?.();
      return;
    }
  }
  window.alert(formatText(title, message));
  lista[0]?.onPress?.();
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

/** La hoja de avisos de la app. Se monta una sola vez, en RootNavigator. */
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

  /** Toque fuera de la hoja: cierra; si hay un botón de cancelar, vale por él. */
  const cerrarPorElFondo = () => {
    close(request.buttons.find((button) => button.style === 'cancel'));
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => close()}>
      <Pressable style={styles.backdrop} onPress={cerrarPorElFondo}>
        {/* La hoja no se cierra al tocarla: para eso están sus botones (o el fondo). */}
        <Pressable
          style={styles.sheet}
          accessibilityViewIsModal
          onPress={() => {
            /* el toque en la hoja no hace nada: solo sus botones actúan */
          }}
        >
          <Text style={styles.title} accessibilityRole="header">
            {request.title}
          </Text>
          {!!request.message && <Text style={styles.message}>{request.message}</Text>}
          {request.buttons.map((button, index) => (
            <TouchableOpacity
              key={`${button.text ?? 'accion'}-${index}`}
              style={styles.button}
              accessibilityRole="button"
              accessibilityLabel={button.text ?? 'Aceptar'}
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: VELO_MODAL,
    justifyContent: 'center',
    alignItems: 'center',
    padding: ESPACIADO.xxl,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: BLANCO,
    borderRadius: RADIOS.lg,
    paddingVertical: ESPACIADO.lg,
    paddingHorizontal: ESPACIADO.xl,
  },
  title: {
    fontSize: TALLAS.subtitulo,
    lineHeight: INTERLINEADO.subtitulo,
    fontWeight: PESO.fuerte,
    color: TEXTO,
    textAlign: 'center',
  },
  message: {
    marginTop: ESPACIADO.sm,
    fontSize: TALLAS.texto,
    lineHeight: INTERLINEADO.texto,
    color: TEXTO_SUAVE,
    textAlign: 'center',
  },
  button: {
    marginTop: ESPACIADO.lg,
    paddingVertical: ESPACIADO.md,
    borderRadius: RADIOS.md,
    backgroundColor: FONDO_TARJETA,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: TALLAS.cuerpo,
    lineHeight: INTERLINEADO.cuerpo,
    fontWeight: PESO.medio,
    color: AZUL,
  },
  destructive: {
    color: ROJO_ACCION,
  },
  cancel: {
    color: TEXTO_TENUE,
  },
});
