import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  Platform,
  TouchableOpacity,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';

import { ChatInputBar, AttachmentType } from '../components/ChatInputBar';
import { Icono, ICONO_AJUSTES } from '../components/Icono';
import { Palomas } from '../components/chat/Palomas';
import { useAuth } from '../context/AuthContext';
import { useMockStore } from '../context/MockStoreContext';
import { useRealtimeMessages } from '../hooks/useRealtimeMessages';
import { Alert } from '../lib/alert';
import { AZUL } from '../lib/colors';
import {
  ChatMessage,
  deleteGroupMessage,
  esEdicionSinMigracion,
  esMigracionAusente,
  fetchGroupChatReads,
  fetchMessagesForGroup,
  insertMessage,
  marcarLecturaDelGrupo,
  updateGroupMessage,
} from '../lib/database';
import { describeError, esFalloDeTransporte, textoDeErrorParaElUsuario } from '../lib/errors';
import {
  AVISO_MIGRACION_0019,
  AVISO_SIN_CAMBIOS,
  AVISO_VENTANA_VENCIDA,
  avisoDeEdicion,
  avisoDeEliminacion,
  CONFIRMACION_ELIMINAR,
  dentroDeLaVentanaDeEdicion,
  idSinGuardar,
  mensajeYaGuardado,
  PLACEHOLDER_EDICION,
} from '../lib/mensajes';
import { abrirMenuDeMensaje } from '../lib/menuDeMensaje';
import { displayName } from '../lib/names';
import { AVISO_MIGRACION_0020, LecturaDeChat, estadoDePalomas } from '../lib/palomas';
import { RootStackParamList } from '../navigation/RootNavigator';

type GroupChatNav = StackNavigationProp<RootStackParamList, 'GroupChat' | 'Settings'>;
type GroupChatRoute = RouteProp<RootStackParamList, 'GroupChat'>;

const DARK_BG = '#2D2D2D';

/** Sondeo de respaldo: las ediciones y los borrados del otro lado llegan igual. */
const SONDEO_MS = 6000;

export function GroupChatScreen() {
  const navigation = useNavigation<GroupChatNav>();
  const route = useRoute<GroupChatRoute>();
  const { groupId, groupName } = route.params;
  const { session } = useAuth();
  const { emitChatNotification, members, loadGroupMembers } = useMockStore();

  const userId = session?.user?.id ?? '';

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  // Mensaje que se está reescribiendo (migración 0019) y bloqueo mientras se
  // guarda, para no disparar dos veces la misma acción.
  const [mensajeEnEdicion, setMensajeEnEdicion] = useState<ChatMessage | null>(null);
  const [accionOcupada, setAccionOcupada] = useState(false);
  // false = falta la migración 0019 (editar y eliminar): se avisa en pantalla.
  const [edicionDisponible, setEdicionDisponible] = useState(true);
  // Confirmación de lectura (0020): hasta cuándo leyó cada integrante del grupo.
  const [lecturas, setLecturas] = useState<LecturaDeChat[]>([]);
  const [lecturasDisponibles, setLecturasDisponibles] = useState(true);

  // Nombre real por integrante: `messages` solo guarda el user_id del
  // remitente, así que antes el chat mostraba UUIDs como nombre.
  const memberNames = useMemo(() => {
    const map: Record<string, string> = {};
    (members[groupId] || []).forEach((member) => {
      map[member.id] = displayName([member.name]);
    });
    return map;
  }, [members, groupId]);

  /** Nombre con el que el sistema declara la acción (nunca un UUID). */
  const miNombre = memberNames[userId] || 'Un integrante';

  /**
   * Los DEMÁS integrantes del grupo: la doble palomita de mis mensajes exige que
   * TODOS ellos hayan leído (como WhatsApp). Si la lista de integrantes todavía no
   * llegó queda vacía y se pinta la palomita simple: nunca se afirma "leído" sin
   * saber quiénes faltan.
   */
  const participantesDelGrupo = useMemo(
    () => Object.keys(memberNames).filter((id) => id !== userId),
    [memberNames, userId]
  );

  useEffect(() => {
    loadGroupMembers(groupId);
  }, [groupId, loadGroupMembers]);

  /**
   * Marcas de lectura del grupo (0020): hasta cuándo leyó cada integrante. Se
   * releen en cada carga y cuando el tiempo real avisa de un cambio.
   */
  const cargarLecturas = useCallback(async () => {
    try {
      const filas = await fetchGroupChatReads(groupId);
      setLecturas(filas);
      setLecturasDisponibles(true);
    } catch (err) {
      if (esMigracionAusente(err)) {
        setLecturasDisponibles(false);
      } else {
        console.warn('[GroupChat] no se pudieron leer las marcas de lectura:', err);
      }
    }
  }, [groupId]);

  /**
   * Marca el grupo como leído AHORA: abre la puerta a la doble palomita de los
   * demás (que exige que TODOS los integrantes hayan leído). La hora la pone la
   * base.
   */
  const marcarComoLeido = useCallback(async () => {
    if (!userId) return;
    try {
      await marcarLecturaDelGrupo(groupId);
    } catch (err) {
      if (esMigracionAusente(err)) {
        setLecturasDisponibles(false);
      } else {
        console.warn('[GroupChat] no se pudo marcar el grupo como leído:', err);
      }
    }
  }, [groupId, userId]);

  const cargarMensajes = useCallback(
    async (silencioso = false) => {
      try {
        const data = await fetchMessagesForGroup(groupId);
        setMessages(data);
        // Con la conversación a la vista se marca leído y se releen las marcas de
        // los demás: así las palomitas quedan al día en cada relectura.
        if (data.length > 0) {
          await marcarComoLeido();
          await cargarLecturas();
        }
      } catch (err) {
        if (!silencioso) console.error('[GroupChat] fetchMessagesForGroup error:', err);
      } finally {
        setLoading(false);
      }
    },
    [groupId, marcarComoLeido, cargarLecturas]
  );

  useEffect(() => {
    let mounted = true;
    fetchMessagesForGroup(groupId)
      .then((data) => {
        if (!mounted) return;
        setMessages(data);
      })
      .catch((err) => {
        console.error('[GroupChat] fetchMessagesForGroup error:', err);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [groupId]);

  // Respaldo del tiempo real: sin esto, la edición o el borrado del otro lado
  // solo se veían al volver a abrir la conversación.
  useEffect(() => {
    const id = setInterval(() => cargarMensajes(true), SONDEO_MS);
    return () => clearInterval(id);
  }, [cargarMensajes]);

  const agregarSiEsNuevo = useCallback(
    (msg: ChatMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      // Llegó un mensaje con el grupo abierto: se marca leído ya (los demás ven la
      // doble palomita sin esperar al sondeo).
      marcarComoLeido();
    },
    [marcarComoLeido]
  );

  /** El otro lado editó su mensaje: se reemplaza el texto y la marca. */
  const reemplazarSiExiste = useCallback((msg: ChatMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)));
  }, []);

  /** Alguien borró un mensaje (el evento no trae la fila): se relee el grupo. */
  const releerConversacion = useCallback(() => {
    cargarMensajes(true);
  }, [cargarMensajes]);

  const callbacksTiempoReal = useMemo(
    () => ({
      onMessage: agregarSiEsNuevo,
      onUpdate: reemplazarSiExiste,
      onDelete: releerConversacion,
      onReads: cargarLecturas,
    }),
    [agregarSiEsNuevo, reemplazarSiExiste, releerConversacion, cargarLecturas]
  );

  useRealtimeMessages(groupId, callbacksTiempoReal);

  /**
   * ¿El mensaje que se quedó sin respuesta está ya guardado? Se lee el grupo y se busca
   * el mismo texto/tipo/firma entre las últimas filas. Si la lectura también falla, null.
   */
  const buscarElMismoMensaje = async (
    content: string,
    type: ChatMessage['type']
  ): Promise<ChatMessage | null> => {
    try {
      const filas = await fetchMessagesForGroup(groupId);
      return mensajeYaGuardado(filas, { content, type, sender_id: userId ?? null });
    } catch {
      return null;
    }
  };

  /**
   * Guarda un mensaje en el grupo.
   *
   * Igual que en el chat del servicio: cuando la escritura se queda SIN RESPUESTA
   * (fallo de transporte) la fila pudo llegar igualmente a la base, así que primero se
   * comprueba y, solo si de verdad no está, se reintenta UNA vez. Antes, un corte de
   * conexión devolvía el texto al campo para reenviar y, si el mensaje sí se había
   * guardado, el reenvío lo DUPLICABA.
   *
   * Devuelve la fila guardada o null si de verdad no se pudo.
   */
  const guardarMensaje = async (
    content: string,
    type: ChatMessage['type']
  ): Promise<ChatMessage | null> => {
    if (!userId) return null;
    const enviar = () => insertMessage(groupId, userId, content, type);
    try {
      return await enviar();
    } catch (err) {
      let fallo: unknown = err;
      if (esFalloDeTransporte(err)) {
        const guardado = await buscarElMismoMensaje(content, type);
        if (guardado) return guardado;
        try {
          return await enviar();
        } catch (err2) {
          fallo = err2;
        }
      }
      console.error('[GroupChat] no se pudo guardar el mensaje:', describeError(fallo), fallo);
      Alert.alert('Error', textoDeErrorParaElUsuario(fallo));
      return null;
    }
  };

  /** Aviso del sistema que declara la acción (edición o borrado). */
  const declararAccion = async (aviso: string) => {
    if (!userId) return;
    // Los mensajes del sistema del grupo llevan el autor que declara: la política de la
    // tabla exige `auth.uid() = sender_id`. La pantalla los pinta centrados, y nadie
    // puede editarlos ni borrarlos.
    const msg = await guardarMensaje(aviso, 'SYSTEM');
    if (msg) setMessages((prev) => [...prev, msg]);
  };

  const handleSend = async () => {
    if (!input.trim() || !userId) return;
    const content = input.trim();
    setInput('');
    const msg = await guardarMensaje(content, 'TEXT');
    if (!msg) {
      // No se guardó: el texto vuelve al campo (y el aviso ya se dio).
      setInput(content);
      return;
    }
    setMessages((prev) => [...prev, msg]);
    emitChatNotification(`Nuevo mensaje en ${groupName}`, content, {
      groupId,
      groupName,
      type: 'GROUP_CHAT',
    });
  };

  const handleSendVoice = async () => {
    if (!userId) return;
    const content = '🎤 Nota de voz (0:03)';
    const msg = await guardarMensaje(content, 'VOICE');
    if (!msg) return;
    setMessages((prev) => [...prev, msg]);
    emitChatNotification(`Nueva nota de voz en ${groupName}`, content, {
      groupId,
      groupName,
      type: 'GROUP_CHAT',
    });
    Alert.alert('Nota de voz', 'Enviada nota de voz de 3 segundos.');
  };

  const handleAttachment = async (type: AttachmentType) => {
    if (!userId) return;
    const labels: Record<AttachmentType, string> = {
      photo: '🖼️ Foto',
      camera: '📷 Cámara',
      location: '📍 Ubicación',
      contact: '👤 Contacto',
    };
    const content = labels[type];
    const msg = await guardarMensaje(content, type.toUpperCase() as ChatMessage['type']);
    if (!msg) return;
    setMessages((prev) => [...prev, msg]);
    emitChatNotification(`Nuevo contenido en ${groupName}`, content, {
      groupId,
      groupName,
      type: 'GROUP_CHAT',
    });
  };

  // ------------------------------------------------- editar / eliminar mensajes
  /** Menú de acciones de un mensaje PROPIO (migración 0019). */
  const handleAccionesDeMensaje = (msg: ChatMessage) => {
    if (!edicionDisponible) {
      Alert.alert('Editar y eliminar', AVISO_MIGRACION_0019);
      return;
    }
    if (idSinGuardar(msg.id)) return;
    abrirMenuDeMensaje({
      created_at: msg.created_at,
      alEditar: () => handleEmpezarEdicion(msg),
      alEliminar: () => handleConfirmarEliminacion(msg),
    });
  };

  const handleEmpezarEdicion = (msg: ChatMessage) => {
    setMensajeEnEdicion(msg);
    setInput(msg.content);
  };

  const handleCancelarEdicion = () => {
    setMensajeEnEdicion(null);
    setInput('');
  };

  /**
   * Guarda el texto nuevo y DESPUÉS declara la edición: nunca se declara una
   * edición que no llegó a guardarse. El texto anterior no se guarda en ningún
   * sitio: solo queda la marca "editado".
   */
  const handleGuardarEdicion = async () => {
    const msg = mensajeEnEdicion;
    if (!msg || accionOcupada) return;
    const texto = input.trim();
    if (!texto) return;

    if (!dentroDeLaVentanaDeEdicion(msg)) {
      handleCancelarEdicion();
      Alert.alert('No se puede editar', AVISO_VENTANA_VENCIDA);
      return;
    }
    if (texto === msg.content) {
      handleCancelarEdicion();
      Alert.alert('Sin cambios', AVISO_SIN_CAMBIOS);
      return;
    }

    setAccionOcupada(true);
    try {
      const guardado = await updateGroupMessage(msg.id, texto);
      if (!guardado) {
        cargarMensajes(true);
        Alert.alert('No se pudo editar', AVISO_VENTANA_VENCIDA);
        return;
      }
      const marca = new Date().toISOString();
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, content: texto, edited_at: marca } : m))
      );
      handleCancelarEdicion();
      await declararAccion(avisoDeEdicion(miNombre));
    } catch (err) {
      if (esEdicionSinMigracion(err)) {
        setEdicionDisponible(false);
        Alert.alert('Editar y eliminar', AVISO_MIGRACION_0019);
      } else {
        Alert.alert('No se pudo editar', 'Revisa tu conexión e intenta de nuevo.');
      }
    } finally {
      setAccionOcupada(false);
    }
  };

  const handleConfirmarEliminacion = (msg: ChatMessage) => {
    Alert.alert('Eliminar mensaje', CONFIRMACION_ELIMINAR, [
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => handleEliminarMensaje(msg),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  /**
   * Borra el mensaje y deja SOLO el aviso del sistema. Si la base no borró nada
   * (no es mío, es del sistema o ya no estaba) no se declara nada.
   */
  const handleEliminarMensaje = async (msg: ChatMessage) => {
    if (accionOcupada) return;
    setAccionOcupada(true);
    try {
      const borrado = await deleteGroupMessage(msg.id);
      if (!borrado) {
        cargarMensajes(true);
        Alert.alert('No se pudo eliminar', 'El mensaje ya no estaba en la conversación.');
        return;
      }
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      if (mensajeEnEdicion?.id === msg.id) handleCancelarEdicion();
      await declararAccion(avisoDeEliminacion(miNombre));
    } catch (err) {
      if (esEdicionSinMigracion(err)) {
        setEdicionDisponible(false);
        Alert.alert('Editar y eliminar', AVISO_MIGRACION_0019);
      } else {
        Alert.alert('No se pudo eliminar', 'Revisa tu conexión e intenta de nuevo.');
      }
    } finally {
      setAccionOcupada(false);
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    if (item.type === 'SYSTEM') {
      return (
        <View style={styles.systemBubble}>
          <Text style={styles.systemText}>{item.content}</Text>
        </View>
      );
    }

    const isMe = item.sender_id === userId;
    const senderLabel = memberNames[item.sender_id] || displayName([item.sender_name]);
    const hora = new Date(item.created_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    // El mensaje editado solo se declara como editado: el texto anterior no se
    // guarda ni se muestra en ninguna parte.
    const marca = item.edited_at ? `${hora} · editado` : hora;

    const contenido = (
      <>
        {!isMe && <Text style={styles.senderName}>{senderLabel}</Text>}
        <View style={[styles.bubble, isMe ? styles.bubbleRight : styles.bubbleLeft]}>
          <Text style={[styles.bubbleText, isMe && styles.bubbleTextMine]}>{item.content}</Text>
          <View style={styles.timeRow}>
            <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMine]}>{marca}</Text>
            {/* Palomitas (0020): solo en mis mensajes. */}
            <Palomas
              estado={estadoDePalomas(item, {
                esMio: isMe,
                participantes: participantesDelGrupo,
                lecturas,
                // El chat de grupo siempre escribe en la base: no hay modo local.
                hayBase: true,
              })}
            />
          </View>
        </View>
      </>
    );

    // Los mensajes propios se pueden editar o eliminar: pulsación larga y, en web
    // (donde no hay costumbre de mantener pulsado), un clic.
    if (isMe) {
      return (
        <TouchableOpacity
          style={[styles.bubbleRow, styles.rowRight]}
          onLongPress={() => handleAccionesDeMensaje(item)}
          onPress={Platform.OS === 'web' ? () => handleAccionesDeMensaje(item) : undefined}
          delayLongPress={400}
          activeOpacity={0.85}
        >
          {contenido}
        </TouchableOpacity>
      );
    }

    return <View style={[styles.bubbleRow, styles.rowLeft]}>{contenido}</View>;
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.headerArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {groupName}
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            accessibilityLabel="Ajustes"
          >
            <Icono fuente={ICONO_AJUSTES} tamano={20} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={DARK_BG} />
          </View>
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messagesList}
          />
        )}

        {!lecturasDisponibles && (
          <View style={styles.aviso}>
            <Text style={styles.avisoTexto}>{AVISO_MIGRACION_0020}</Text>
          </View>
        )}

        {!edicionDisponible && (
          <View style={styles.aviso}>
            <Text style={styles.avisoTexto}>{AVISO_MIGRACION_0019}</Text>
          </View>
        )}

        <ChatInputBar
          value={input}
          onChangeText={setInput}
          onSend={mensajeEnEdicion ? handleGuardarEdicion : handleSend}
          onSendVoice={handleSendVoice}
          onAttachment={handleAttachment}
          editando={!!mensajeEnEdicion}
          onCancelarEdicion={handleCancelarEdicion}
          placeholder={mensajeEnEdicion ? PLACEHOLDER_EDICION : undefined}
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: DARK_BG,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  headerArrow: {
    color: '#fff',
    fontSize: 24,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  messagesList: {
    padding: 16,
    paddingBottom: 20,
  },
  bubbleRow: {
    marginBottom: 8,
    maxWidth: '78%',
  },
  rowLeft: {
    alignSelf: 'flex-start',
  },
  rowRight: {
    alignSelf: 'flex-end',
  },
  senderName: {
    fontSize: 11,
    color: '#888',
    marginBottom: 2,
    marginLeft: 4,
  },
  bubble: {
    borderRadius: 16,
    padding: 10,
    paddingHorizontal: 12,
  },
  bubbleLeft: {
    backgroundColor: '#C6C6C6',
    borderBottomLeftRadius: 4,
  },
  bubbleRight: {
    backgroundColor: AZUL,
    borderBottomRightRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    color: '#2D2D2D',
    lineHeight: 20,
  },
  bubbleTextMine: {
    color: '#FFFFFF',
  },
  bubbleTime: {
    fontSize: 10,
    color: '#555555',
  },
  /** Hora + palomitas (0020), pegadas al borde derecho de la burbuja. */
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  bubbleTimeMine: {
    color: 'rgba(255,255,255,0.75)',
  },
  systemBubble: {
    alignSelf: 'center',
    marginVertical: 8,
  },
  systemText: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
    textAlign: 'center',
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
});
