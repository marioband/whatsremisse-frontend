import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  PanResponder,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  View,
} from 'react-native';

import { Alert } from '../lib/alert';
import {
  AZUL,
  BORDE_SUAVE,
  FONDO_TARJETA,
  ROJO_ACCION,
  TEXTO,
  TEXTO_SUAVE,
  TEXTO_TENUE,
} from '../lib/colors';
import { duracionEnTexto, empezarAGrabar, Grabacion, Grabadora } from '../lib/grabacionDeAudio';
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
  /**
   * Enviar una NOTA DE VOZ ya grabada (19-09-2026). Recibe el audio en crudo: la pantalla lo
   * sube al almacén y manda el mensaje, igual que hace con las fotos.
   */
  onEnviarNotaDeVoz: (grabacion: Grabacion) => void;
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

/**
 * Cuánto hay que deslizar para bloquear la grabación (seguir sin mantener pulsado) y para
 * cancelarla, en píxeles. Son los mismos gestos de WhatsApp: ▲ bloquea, ◀ cancela.
 */
const DESLIZ_BLOQUEAR = -60;
const DESLIZ_CANCELAR = -70;

/** Por debajo de esto no es una nota de voz: es un toque suelto (WhatsApp tampoco la manda). */
const DURACION_MINIMA_MS = 900;

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
  onEnviarNotaDeVoz,
  onAttachment,
  placeholder = 'Escribe un mensaje...',
  editando = false,
  onCancelarEdicion,
}: ChatInputBarProps) {
  const [trayOpen, setTrayOpen] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Con texto escrito el botón derecho envía el mensaje; vacío graba una nota de voz.
  const hasText = value.trim().length > 0;

  // ---------------------------------------------------------------- nota de voz
  const [grabando, setGrabando] = useState(false);
  const [bloqueada, setBloqueada] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [pausada, setPausada] = useState(false);
  const [transcurrido, setTranscurrido] = useState(0);

  const grabadoraRef = useRef<Grabadora | null>(null);
  // Los gestos viven en el responder, que se crea UNA vez: el estado actual va en refs para
  // que no lea valores viejos (si no, soltar después de bloquear mandaría el audio a medias).
  const bloqueadaRef = useRef(false);
  const cancelandoRef = useRef(false);
  /** El responder se crea UNA vez: necesita saber si se está grabando sin leer el estado. */
  const grabandoRef = useRef(false);

  useEffect(() => {
    if (!grabando) return;
    const reloj = setInterval(() => {
      setTranscurrido(grabadoraRef.current?.transcurridoMs() ?? 0);
    }, 200);
    return () => clearInterval(reloj);
  }, [grabando]);
  // El micrófono se suelta si la barra desaparece con una grabación abierta.
  useEffect(
    () => () => {
      grabadoraRef.current?.cancelar();
      grabadoraRef.current = null;
    },
    []
  );

  const limpiarGrabacion = () => {
    grabandoRef.current = false;
    grabadoraRef.current = null;
    bloqueadaRef.current = false;
    cancelandoRef.current = false;
    setGrabando(false);
    setBloqueada(false);
    setCancelando(false);
    setPausada(false);
    setTranscurrido(0);
  };

  /** Mantener pulsado el micrófono: se pide el permiso y se empieza a grabar. */
  const empezarGrabacion = async () => {
    if (grabando) return;
    Keyboard.dismiss();
    setTrayOpen(false);
    const permiso = await empezarAGrabar();
    if (!permiso.ok) {
      Alert.alert('Micrófono', permiso.motivo);
      limpiarGrabacion();
      return;
    }
    grabadoraRef.current = permiso.valor;
    grabandoRef.current = true;
    setGrabando(true);
  };

  /** Soltar: manda la nota de voz (o la cancela, si se deslizó para cancelar). */
  const soltarGrabacion = async () => {
    const grabadora = grabadoraRef.current;
    if (!grabadora) {
      limpiarGrabacion();
      return;
    }
    // Bloqueada: el dedo ya no manda; seguirá grabando hasta pulsar enviar o cancelar.
    if (bloqueadaRef.current && !cancelandoRef.current) return;

    if (cancelandoRef.current) {
      grabadora.cancelar();
      limpiarGrabacion();
      return;
    }
    const duracion = grabadora.transcurridoMs();
    const grabacion = await grabadora.detener();
    limpiarGrabacion();
    if (!grabacion) return;
    if (duracion < DURACION_MINIMA_MS) {
      // Un toque suelto no es una nota de voz: se avisa cómo se graba.
      Alert.alert(
        'Nota de voz',
        'Mantén pulsado el micrófono para grabar (o desliza hacia arriba para grabar sin mantener).'
      );
      return;
    }
    onEnviarNotaDeVoz(grabacion);
  };

  const cancelar = () => {
    grabadoraRef.current?.cancelar();
    limpiarGrabacion();
  };

  const alternarPausa = () => {
    const grabadora = grabadoraRef.current;
    if (!grabadora) return;
    if (grabadora.enPausa()) {
      grabadora.reanudar();
      setPausada(false);
      return;
    }
    grabadora.pausar();
    setPausada(true);
  };

  const enviarGrabacion = async () => {
    const grabadora = grabadoraRef.current;
    if (!grabadora) return;
    const grabacion = await grabadora.detener();
    limpiarGrabacion();
    if (grabacion) onEnviarNotaDeVoz(grabacion);
  };

  const responderDelMicrofono = useRef(
    PanResponder.create({
      // Solo reclama el toque cuando NO se está grabando: con la grabación bloqueada, los
      // botones de pausar/cancelar/enviar que van DENTRO tienen que poder pulsarse.
      onStartShouldSetPanResponder: () => !grabandoRef.current,
      onMoveShouldSetPanResponder: () => !grabandoRef.current,
      onPanResponderGrant: () => {
        void empezarGrabacion();
      },
      onPanResponderMove: (_evento, gesto) => {
        if (gesto.dy < DESLIZ_BLOQUEAR && !bloqueadaRef.current) {
          bloqueadaRef.current = true;
          setBloqueada(true);
        }
        const cancela = gesto.dx < DESLIZ_CANCELAR;
        if (cancela !== cancelandoRef.current) {
          cancelandoRef.current = cancela;
          setCancelando(cancela);
        }
      },
      onPanResponderRelease: () => {
        void soltarGrabacion();
      },
      onPanResponderTerminate: () => {
        cancelar();
      },
    })
  ).current;

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

        {grabando ? (
          /* Grabando: la píldora se convierte en el aviso de la grabación (tiempo + gestos). */
          <View style={[styles.inputPill, styles.grabandoPill]}>
            <View style={[styles.puntoRojo, pausada && styles.puntoEnPausa]} />
            <Text style={styles.grabandoTiempo}>{duracionEnTexto(transcurrido)}</Text>
            <Text style={styles.grabandoAyuda} numberOfLines={1}>
              {bloqueada
                ? pausada
                  ? 'En pausa'
                  : 'Grabando sin mantener'
                : cancelando
                  ? 'Suelta para cancelar'
                  : '◀ cancelar · ▲ sin mantener'}
            </Text>
          </View>
        ) : (
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
        )}

        {editando || hasText ? (
          <TouchableOpacity
            style={[styles.actionBtn, editando && !hasText && styles.actionBtnMuted]}
            onPress={onSend}
            disabled={editando && !hasText}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={editando ? 'Guardar el mensaje editado' : 'Enviar mensaje'}
          >
            <MaterialCommunityIcons
              name={editando ? ICONS.guardar : ICONS.enviar}
              size={24}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        ) : (
          /*
           * El gesto de mantener pulsado vive en este CONTENEDOR, que no se desmonta al
           * cambiar de "micrófono" a "pausar/cancelar/enviar": si el nodo del gesto desaparece
           * mientras el dedo está apoyado, el sistema da el gesto por terminado y cancela la
           * grabación (medido en el banco: al pasar a bloqueada se perdía lo grabado).
           */
          <View
            style={grabando && bloqueada ? styles.accionesBloqueadas : styles.accionSuelta}
            {...responderDelMicrofono.panHandlers}
            {...(Platform.OS === 'web' ? { dataSet: { micro: 'tocable' } } : null)}
          >
            {grabando && bloqueada ? (
              <>
                <TouchableOpacity
                  style={styles.roundBtn}
                  onPress={alternarPausa}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={pausada ? 'Reanudar la grabación' : 'Pausar la grabación'}
                >
                  <MaterialCommunityIcons
                    name={pausada ? 'play' : 'pause'}
                    size={22}
                    color={TEXTO_SUAVE}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.roundBtn, styles.roundBtnCancelar]}
                  onPress={cancelar}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Cancelar la grabación"
                >
                  <MaterialCommunityIcons name="close" size={22} color={ROJO_ACCION} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={enviarGrabacion}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Enviar la nota de voz"
                >
                  <MaterialCommunityIcons name={ICONS.enviar} size={24} color="#FFFFFF" />
                </TouchableOpacity>
              </>
            ) : (
              <View
                style={styles.actionBtn}
                accessibilityRole="button"
                accessibilityLabel="Grabar nota de voz"
              >
                <MaterialCommunityIcons name={ICONS.microfono} size={24} color="#FFFFFF" />
              </View>
            )}
          </View>
        )}
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
    // El micrófono se queda el gesto: sin esto, al mover el dedo el navegador cree que se
    // desplaza la página, manda `pointercancel` y la grabación se cancelaba sola (medido).
    ...Platform.select({ web: { touchAction: 'none' } as object }),
  },
  /** El contenedor del gesto cuando se puede empezar a grabar (solo el micrófono). */
  accionSuelta: { flexDirection: 'row', alignItems: 'center' },
  /** Con la grabación bloqueada: pausar, cancelar y enviar, en fila. */
  accionesBloqueadas: { flexDirection: 'row', alignItems: 'center' },
  roundBtnCancelar: { marginHorizontal: 8 },
  /** Al editar sin texto no hay nada que guardar: el botón se ve apagado. */
  actionBtnMuted: {
    opacity: 0.45,
  },
  /**
   * La píldora mientras se graba: punto rojo, tiempo y la ayuda de los gestos (WhatsApp).
   * El punto se queda ámbar en pausa para que se vea de un vistazo que NO está grabando.
   */
  grabandoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3F3',
    borderWidth: 1,
    borderColor: ROJO_ACCION,
  },
  puntoRojo: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: ROJO_ACCION,
    marginRight: 8,
  },
  puntoEnPausa: {
    backgroundColor: '#C9A227',
  },
  grabandoTiempo: {
    fontSize: 14,
    fontWeight: '700',
    color: TEXTO,
    marginRight: 8,
  },
  grabandoAyuda: {
    flex: 1,
    fontSize: 12,
    color: TEXTO_SUAVE,
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
