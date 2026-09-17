import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  View,
} from 'react-native';

import { AZUL, BORDE_SUAVE, FONDO_TARJETA, TEXTO, TEXTO_SUAVE, TEXTO_TENUE } from '../lib/colors';
import { TITULO_EDITANDO } from '../lib/mensajes';

export type AttachmentType = 'photo' | 'camera' | 'location' | 'contact';

/**
 * Nombres de los iconos del chat (familia MaterialCommunityIcons).
 *
 * Son provisionales: el usuario enviará los iconos definitivos de la app. Para
 * sustituirlos basta cambiar el `name` de cada entrada (o la familia en el
 * import) sin tocar el resto del componente.
 */
const ICONS = {
  adjuntar: 'plus',
  teclado: 'keyboard-outline',
  camara: 'camera',
  enviar: 'send',
  microfono: 'microphone',
  fotos: 'image-multiple',
  ubicacion: 'map-marker',
  contacto: 'account-circle-outline',
  guardar: 'check',
} as const;

interface ChatInputBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onSendVoice: () => void;
  onAttachment: (type: AttachmentType) => void;
  placeholder?: string;
  /**
   * Modo edición: la barra está reescribiendo un mensaje ya enviado. Se anuncia
   * arriba ("Editando mensaje") con la salida para cancelar, y el botón de
   * adjuntos desaparece porque aquí solo se cambia el texto.
   */
  editando?: boolean;
  onCancelarEdicion?: () => void;
}

const ATTACHMENT_OPTIONS: {
  type: AttachmentType;
  icon: keyof typeof ICONS;
  label: string;
}[] = [
  { type: 'photo', icon: 'fotos', label: 'Fotos' },
  { type: 'camera', icon: 'camara', label: 'Cámara' },
  { type: 'location', icon: 'ubicacion', label: 'Ubicación' },
  { type: 'contact', icon: 'contacto', label: 'Contacto' },
];

export function ChatInputBar({
  value,
  onChangeText,
  onSend,
  onSendVoice,
  onAttachment,
  placeholder = 'Escribe un mensaje...',
  editando = false,
  onCancelarEdicion,
}: ChatInputBarProps) {
  const [trayOpen, setTrayOpen] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Con texto escrito el botón derecho envía el mensaje; vacío envía audio.
  const hasText = value.trim().length > 0;

  const toggleTray = () => {
    // La bandeja de adjuntos sustituye al teclado, igual que en la referencia.
    if (trayOpen) {
      setTrayOpen(false);
      inputRef.current?.focus();
      return;
    }
    Keyboard.dismiss();
    setTrayOpen(true);
  };

  const closeTray = () => setTrayOpen(false);

  const handleAttachment = (type: AttachmentType) => {
    onAttachment(type);
    closeTray();
  };

  return (
    <View style={styles.wrapper}>
      {/* Modo edición: se dice qué se está haciendo y cómo salir sin guardar. */}
      {editando && (
        <View style={styles.editBanner}>
          <MaterialCommunityIcons name="pencil" size={16} color={AZUL} />
          <Text style={styles.editBannerText}>{TITULO_EDITANDO}</Text>
          <TouchableOpacity
            onPress={onCancelarEdicion}
            accessibilityLabel="Cancelar edición"
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="close" size={18} color={TEXTO_SUAVE} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.bar}>
        {/* Adjuntar: es la única entrada a cámara/fotos/ubicación/contacto. Al
            editar un mensaje no se adjunta nada, así que el botón no se pinta. */}
        {!editando && (
          <TouchableOpacity
            style={styles.roundBtn}
            onPress={toggleTray}
            activeOpacity={0.7}
            accessibilityLabel={trayOpen ? 'Cerrar adjuntos' : 'Adjuntar'}
          >
            <MaterialCommunityIcons
              name={trayOpen ? ICONS.teclado : ICONS.adjuntar}
              size={24}
              color={TEXTO_SUAVE}
            />
          </TouchableOpacity>
        )}

        <View style={styles.inputPill}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor={TEXTO_TENUE}
            value={value}
            onChangeText={onChangeText}
            onFocus={closeTray}
            multiline
            maxLength={1000}
          />
        </View>

        <TouchableOpacity
          style={[styles.actionBtn, editando && !hasText && styles.actionBtnMuted]}
          onPress={editando ? onSend : hasText ? onSend : onSendVoice}
          disabled={editando && !hasText}
          activeOpacity={0.7}
          accessibilityLabel={
            editando ? 'Guardar el mensaje editado' : hasText ? 'Enviar mensaje' : 'Enviar audio'
          }
        >
          <MaterialCommunityIcons
            name={editando ? ICONS.guardar : hasText ? ICONS.enviar : ICONS.microfono}
            size={24}
            color="#FFFFFF"
          />
        </TouchableOpacity>
      </View>

      {trayOpen && (
        <View style={styles.tray}>
          {ATTACHMENT_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.type}
              style={styles.trayItem}
              onPress={() => handleAttachment(option.type)}
              activeOpacity={0.7}
              accessibilityLabel={option.label}
            >
              <View style={styles.trayIconCircle}>
                <MaterialCommunityIcons name={ICONS[option.icon]} size={26} color={AZUL} />
              </View>
              <Text style={styles.trayLabel}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  /** Franja del modo edición: qué se está haciendo y cómo salir. */
  editBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF1FB',
    borderTopWidth: 0.5,
    borderTopColor: BORDE_SUAVE,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  editBannerText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
    fontWeight: '600',
    color: AZUL,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: FONDO_TARJETA,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: 0.5,
    borderTopColor: BORDE_SUAVE,
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputPill: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginHorizontal: 8,
    minHeight: 40,
    maxHeight: 104,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: TEXTO,
    maxHeight: 96,
    // Simétrico arriba/abajo: el texto queda centrado en la píldora de una línea
    // y crece hacia abajo cuando el mensaje es largo.
    paddingTop: 9,
    paddingBottom: 9,
    ...Platform.select({ android: { textAlignVertical: 'center' as const }, default: {} }),
    // En web el campo es un textarea y el navegador le dibuja su propio recuadro de
    // foco (outline) al pulsarlo: la app no lo quiere. En nativo no existe.
    ...Platform.select({ web: { outlineStyle: 'none' } as object }),
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: AZUL,
    justifyContent: 'center',
    alignItems: 'center',
  },
  /** Al editar sin texto no hay nada que guardar: el botón se ve apagado. */
  actionBtnMuted: {
    opacity: 0.45,
  },
  tray: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: 8,
  },
  trayItem: {
    alignItems: 'center',
    minWidth: 68,
  },
  trayIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: FONDO_TARJETA,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  trayLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: TEXTO_SUAVE,
  },
});
