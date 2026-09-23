import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  SafeAreaView,
  FlatList,
  Platform,
  TouchableOpacity,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';

import { ChatInputBar, AttachmentType } from '../components/ChatInputBar';
import { CompartirContacto } from '../components/chat/CompartirContacto';
import { ContenidoDelMensaje } from '../components/chat/ContenidoDelMensaje';
import { DELAY_PULSACION_LARGA_MS } from '../components/chat/MessageList';
import { Palomas } from '../components/chat/Palomas';
import { destinoDeVuelta } from '../lib/volverDelChat';
import { textoDelContacto } from '../lib/contactosDelTelefono';
import { useAuth } from '../context/AuthContext';
import { useMockStore } from '../context/MockStoreContext';
import { useConversacionVista } from '../hooks/useConversacionVista';
import { useRealtimeMessages } from '../hooks/useRealtimeMessages';
import { useTecladoAbierto } from '../hooks/useTecladoAbierto';
import {
  elegirFoto,
  fueCancelado,
  subirFoto,
  textoDeFoto,
  textoDeUbicacion,
  tomarFoto,
  ubicacionParaAdjuntar,
  subirAudio,
} from '../lib/adjuntos';
import { Alert } from '../lib/alert';
import { AZUL } from '../lib/colors';
import { urlDeLaConversacion } from '../lib/conversacionVista';
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
  marcarGrupoLeido,
} from '../lib/database';
import { describeError, esFalloDeTransporte, textoDeErrorParaElUsuario } from '../lib/errors';
import { duracionEnTexto, Grabacion } from '../lib/grabacionDeAudio';
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
import { IconoDeAtras } from '../components/IconoDeAtras';

type GroupChatNav = StackNavigationProp<
  RootStackParamList,
  'GroupChat' | 'Settings' | 'GroupMembers'
>;
type GroupChatRoute = RouteProp<RootStackParamList, 'GroupChat'>;

const DARK_BG = '#2D2D2D';

/** El nombre del grupo en la cabecera del chat. */
const TAMANO_DEL_NOMBRE_EN_EL_TITULO = 18;
/**
 * El círculo con la imagen del grupo, junto al nombre (23-09-2026).
 *
 * Pedido del usuario: «el circulo de la imagen debe ser 50 % más grande que el texto del nombre del
 * grupo». La cuenta queda escrita aquí, no a mano, para que no se desajusten si cambia el nombre.
 */
const TAMANO_DE_LA_IMAGEN_DEL_TITULO = TAMANO_DEL_NOMBRE_EN_EL_TITULO * 1.5;
/** La caja de la flecha de atrás (y el hueco de la derecha, que mide lo mismo para centrar). */
const TAMANO_DEL_HUECO_DE_LA_FLECHA = 34;

/** Sondeo de respaldo: las ediciones y los borrados del otro lado llegan igual. */
const SONDEO_MS = 6000;

export function GroupChatScreen() {
  const navigation = useNavigation<GroupChatNav>();
  const route = useRoute<GroupChatRoute>();
  const { groupId, groupName } = route.params;

  // «Estoy viendo esta conversación» (20-09-2026): dentro del chat no llega el aviso de lo que
  // ya se está leyendo; al minimizar la app la marca se borra y el aviso vuelve.
  useConversacionVista(urlDeLaConversacion('grupo', groupId));
  const { session } = useAuth();
  const { members, loadGroupMembers, groups, setRole } = useMockStore();

  /** La ventana de «Compartir un contacto» (20-09-2026). */
  const [compartirContacto, setCompartirContacto] = useState(false);

  /** El grupo tal como lo tiene el almacén: de ahí salen la foto y el nombre de la cabecera. */
  const grupo = useMemo(() => groups.find((g) => g.id === groupId), [groups, groupId]);

  /**
   * El nombre que se enseña: el del almacén manda sobre el de la ruta, porque en los ajustes se
   * puede cambiar el nombre y al volver al chat tiene que verse el nuevo (23-09-2026).
   */
  const nombreDelGrupo = grupo?.name || groupName;

  /**
   * Abrir el chat del grupo lo marca como leído: el globo del contador del apartado «Mis grupos»
   * vuelve a cero (0028, pedido del usuario del 19-09-2026).
   */
  useEffect(() => {
    void marcarGrupoLeido(groupId).catch(() => undefined);
  }, [groupId]);

  const userId = session?.user?.id ?? '';

  const [input, setInput] = useState('');
  // Mientras se elige/sube un adjunto no se lanza otro (ni dos veces el mismo).
  const [adjuntoEnCurso, setAdjuntoEnCurso] = useState(false);
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

  useRealtimeMessages(groupId, callbacksTiempoReal, { miId: userId, nombreDelGrupo: nombreDelGrupo });

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
    type: ChatMessage['type'],
    metadata: Record<string, unknown> = {}
  ): Promise<ChatMessage | null> => {
    if (!userId) return null;
    const enviar = () => insertMessage(groupId, userId, content, type, metadata);
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
    // El aviso lo da el dispositivo que recibe el mensaje (tiempo real), no este.
    setMessages((prev) => [...prev, msg]);
  };

  /**
   * Nota de voz grabada (19-09-2026): antes se mandaba el texto «🎤 Nota de voz (0:03)» con un
   * aviso diciendo que se había enviado. Ahora el audio grabado se sube al almacén y viaja como
   * URL, igual que las fotos del grupo.
   */
  const handleEnviarNotaDeVoz = async (grabacion: Grabacion) => {
    if (!userId) {
      Alert.alert('No se pudo enviar la nota de voz', 'Vuelve a entrar a tu cuenta e inténtalo.');
      return;
    }
    const subida = await subirAudio(grabacion, userId);
    if (!subida.ok) {
      Alert.alert('No se pudo enviar la nota de voz', subida.motivo);
      return;
    }
    const segundos = Math.max(1, Math.round(grabacion.duracionMs / 1000));
    const msg = await guardarMensaje(
      `🎤 Nota de voz (${duracionEnTexto(grabacion.duracionMs)})`,
      'VOICE',
      {
        url: subida.valor,
        duration: segundos,
        tipo: grabacion.tipo,
      }
    );
    if (!msg) return;
    setMessages((prev) => [...prev, msg]);
  };

  /**
   * Bandeja de adjuntos del grupo: pide el permiso y manda el contenido de verdad.
   *
   * OJO (lo que estaba roto): antes se guardaba `type='CAMERA'`, que NO está entre las clases
   * que admite la tabla (`TEXT, SYSTEM, VOICE, PHOTO, LOCATION, CONTACT`): la base rechazaba
   * la fila con `23514 viola messages_type_check` y el mensaje se perdía. La foto de cámara
   * es una FOTO (`PHOTO`), que es lo que corresponde.
   */
  const handleAttachment = async (type: AttachmentType) => {
    if (!userId || adjuntoEnCurso) return;

    if (type === 'contact') {
      // Se abre la ventana de compartir un contacto (la lista del teléfono donde el navegador lo
      // permita, o a mano). Antes mandaba un mensaje que solo decía «👤 Contacto», sin ningún dato
      // (reporte del usuario, 20-09-2026: «el botón de contacto no funciona»).
      setCompartirContacto(true);
      return;
    }

    setAdjuntoEnCurso(true);
    try {
      if (type === 'photo' || type === 'camera') {
        const elegida = type === 'camera' ? await tomarFoto() : await elegirFoto();
        if (!elegida.ok) {
          if (!fueCancelado(elegida)) Alert.alert('Foto', elegida.motivo);
          return;
        }
        const subida = await subirFoto(elegida.valor, userId);
        if (!subida.ok) {
          Alert.alert('Foto', subida.motivo);
          return;
        }
        const msg = await guardarMensaje(textoDeFoto(type === 'camera'), 'PHOTO', {
          url: subida.valor,
          ancho: elegida.valor.ancho,
          alto: elegida.valor.alto,
        });
        if (msg) setMessages((prev) => [...prev, msg]);
        return;
      }

      const ubicacion = await ubicacionParaAdjuntar();
      if (!ubicacion.ok) {
        Alert.alert('Ubicación', ubicacion.motivo);
        return;
      }
      const msg = await guardarMensaje(textoDeUbicacion(ubicacion.valor), 'LOCATION', {
        lat: ubicacion.valor.lat,
        lng: ubicacion.valor.lng,
        precision: ubicacion.valor.precision ?? null,
      });
      if (msg) setMessages((prev) => [...prev, msg]);
    } finally {
      setAdjuntoEnCurso(false);
    }
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
        <View
          style={[
            styles.bubble,
            isMe ? styles.bubbleRight : styles.bubbleLeft,
            item.type === 'PHOTO' && styles.bubbleConFoto,
          ]}
        >
          <ContenidoDelMensaje
            tipo={item.type}
            contenido={item.content}
            metadata={item.metadata}
            estiloTexto={[styles.bubbleText, isMe && styles.bubbleTextMine]}
            colorDelEnlace={isMe ? 'rgba(255,255,255,0.85)' : '#555555'}
          />
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

    // Los mensajes propios se pueden editar o eliminar MANTENIENDO PULSADO, con el mismo
    // tiempo que en el chat del servicio (regla del usuario, 19-09-2026). El clic suelto que
    // había en web se quitó: sacaba el menú de borrar cuando solo se quería tocar el mensaje.
    // La marca `data-mensaje` es la que apaga en iPhone el menú de texto del sistema, que se
    // comía la pulsación larga (ver el CSS de `App.tsx`).
    if (isMe) {
      return (
        <TouchableOpacity
          style={[styles.bubbleRow, styles.rowRight]}
          onLongPress={() => handleAccionesDeMensaje(item)}
          delayLongPress={DELAY_PULSACION_LARGA_MS}
          activeOpacity={0.85}
          {...(Platform.OS === 'web' ? { dataSet: { mensaje: 'tocable' } } : null)}
        >
          {contenido}
        </TouchableOpacity>
      );
    }

    return <View style={[styles.bubbleRow, styles.rowLeft]}>{contenido}</View>;
  };

  // Con el teclado abierto, la barra de escribir no lleva hueco inferior: va pegada a él.
  const tecladoAbierto = useTecladoAbierto();

  /**
   * La flecha de atrás NUNCA puede quedar muerta.
   *
   * El chat de grupo tiene dirección propia (`/grupo/<id>`): si el navegador recarga la app estando
   * aquí —pasa al volver de Google Maps, porque iOS descarga la pestaña— la app arranca con esta
   * conversación como única pantalla y `goBack()` no tiene a dónde ir (reporte del usuario,
   * 20-09-2026: «al regresar a la pantalla del chat del grupo, ya no puedo seleccionar el botón
   * atrás»). Sin historial, se vuelve a «Mis grupos».
   */
  const volverAtras = () => {
    const destino = destinoDeVuelta(navigation.canGoBack(), 'grupo');
    if (destino === 'atras') {
      navigation.goBack();
      return;
    }
    setRole('GROUP_OWNER');
    navigation.navigate('Main');
  };

  return (
    <SafeAreaView style={[styles.container, styles.sinInsetInferior]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={volverAtras} accessibilityLabel="Volver" style={styles.backBox}>
            <IconoDeAtras />
          </TouchableOpacity>
          {/*
            El título ENTERO es el botón de los ajustes del grupo (23-09-2026): la IMAGEN del grupo a
            la izquierda, el NOMBRE a la derecha, los dos juntos y centrados. El usuario mandó retirar
            de aquí el corazón (fijar) y el engrane (ajustes): el corazón ahora es el botón «fijar» de
            los ajustes, y los ajustes se abren tocando este título.
          */}
          <TouchableOpacity
            style={styles.tituloDelGrupo}
            onPress={() =>
              navigation.navigate('GroupMembers', { groupId, groupName: nombreDelGrupo })
            }
            accessibilityRole="button"
            accessibilityLabel={`Ajustes del grupo ${nombreDelGrupo}`}
            accessibilityHint="Abre los ajustes: foto, nombre, integrantes y los botones del grupo."
          >
            {/* La imagen y el nombre van JUNTOS en su propia fila centrada. Con los dos sueltos dentro
                del botón, el nombre se estiraba (tenía `flex: 1`) y empujaba la imagen al borde
                izquierdo — que es justo lo que el usuario reportó dos veces («la imagen del grupo debe
                estar junto al nombre, ambos centrados», 23-09-2026). */}
            <View style={styles.tituloContenido}>
              {grupo?.avatarUrl ? (
                <Image source={{ uri: grupo.avatarUrl }} style={styles.avatarDelTitulo} />
              ) : (
                <View style={styles.avatarDelTitulo}>
                  <Text style={styles.avatarDelTituloTexto}>{nombreDelGrupo.charAt(0)}</Text>
                </View>
              )}
              <Text style={styles.headerTitle} numberOfLines={1}>
                {nombreDelGrupo}
              </Text>
            </View>
          </TouchableOpacity>
          {/* El mismo ancho que la flecha, para que el título quede centrado de verdad. */}
          <View style={styles.headerSpacer} />
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

        {/* El hueco del indicador de inicio lo lleva la barra de escribir, y solo cuando el
            teclado NO está abierto: con el teclado asomaba como una franja en blanco. */}
        <SafeAreaView style={[styles.zonaDelInput, tecladoAbierto && styles.sinInsetInferior]}>
          <ChatInputBar
            value={input}
            onChangeText={setInput}
            onSend={mensajeEnEdicion ? handleGuardarEdicion : handleSend}
            onEnviarNotaDeVoz={handleEnviarNotaDeVoz}
            onAttachment={handleAttachment}
            editando={!!mensajeEnEdicion}
            onCancelarEdicion={handleCancelarEdicion}
            placeholder={mensajeEnEdicion ? PLACEHOLDER_EDICION : undefined}
          />
        </SafeAreaView>
      </KeyboardAvoidingView>

      {/* Compartir un contacto: se abre desde la bandeja de adjuntos. */}
      <CompartirContacto
        visible={compartirContacto}
        onCerrar={() => setCompartirContacto(false)}
        onEnviar={async (contacto) => {
          setCompartirContacto(false);
          const msg = await guardarMensaje(textoDelContacto(contacto), 'CONTACT', {
            nombre: contacto.nombre,
            telefono: contacto.telefono,
          });
          if (msg) setMessages((prev) => [...prev, msg]);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    /** El hueco de abajo lo lleva la barra de escribir (ver `zonaDelInput`). */
    paddingBottom: 0,
    backgroundColor: '#FFFFFF',
  },
  /** Barra de escribir + bandeja: van al fondo, pegadas al borde o al teclado. */
  zonaDelInput: {
    paddingTop: 0,
  },
  /** Deja el inset de la SafeAreaView a cero (arriba o abajo según dónde se aplique). */
  sinInsetInferior: {
    paddingBottom: 0,
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
    minHeight: 102,
  },
  headerArrow: {
    color: '#fff',
    fontSize: 24,
  },
  /** Los dos botones de la derecha: corazón y engrane, del mismo cuerpo (22). */
  /* El título (imagen + nombre) es un botón: los dos van juntos y centrados. */
  tituloDelGrupo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarDelTitulo: {
    // 23-09-2026: «el círculo de la imagen debe ser 50 % más grande que el texto del nombre».
    width: TAMANO_DE_LA_IMAGEN_DEL_TITULO,
    height: TAMANO_DE_LA_IMAGEN_DEL_TITULO,
    borderRadius: TAMANO_DE_LA_IMAGEN_DEL_TITULO / 2,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  avatarDelTituloTexto: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  /** La flecha vive en una caja FIJA: el hueco de la derecha mide lo mismo y el título centra exacto. */
  backBox: {
    width: 36,
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
  },
  /* El hueco de la flecha, del MISMO ancho que ella: sin esto el título se va a un lado. */
  headerSpacer: { width: 36 },
  /** La fila que va DENTRO del botón: imagen + nombre, juntos y centrados. */
  tituloContenido: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#fff',
    // El tamaño sale de la constante: el círculo de la imagen se calcula desde él (nombre × 1,5).
    fontSize: TAMANO_DEL_NOMBRE_EN_EL_TITULO,
    fontWeight: 'bold',
    // NO lleva ``: así el nombre mide lo suyo y queda PEGADO a la imagen. Solo se encoge
    // (`flexShrink`) si es larguísimo, para no salirse de la cabecera.
    flexShrink: 1,
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
  /** La foto va a sangre dentro de la burbuja (sin relleno lateral extra). */
  bubbleConFoto: { paddingHorizontal: 6, paddingTop: 6 },
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
