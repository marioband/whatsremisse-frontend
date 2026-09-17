import React from 'react';
import { View, Text, FlatList, Platform, StyleSheet, TouchableOpacity } from 'react-native';

import { AZUL, TEXTO } from '../../lib/colors';
import { Message } from '../../types';

interface MessageListProps {
  messages: Message[];
  mySenderId: string;
  listRef: React.RefObject<FlatList>;
  ListHeaderComponent?: React.ComponentType<any> | React.ReactElement | null;
  /**
   * Menú de acciones de un mensaje PROPIO (editar / eliminar). Solo se ofrece en
   * los mensajes que escribió este usuario; los del sistema y los del otro no se
   * pueden tocar, así que no se pintan como tocables.
   */
  onActions?: (message: Message) => void;
}

/**
 * Colores de las burbujas (fijados con el usuario): fondo del chat blanco,
 * azul de marca para quien escribe (texto blanco) y gris para el otro
 * (texto oscuro). Antes eran los verdes de WhatsApp (#dcf8c6 / #fff).
 */
const MY_BUBBLE = AZUL;
const OTHER_BUBBLE = '#C6C6C6';

const COLORS_MINE = {
  text: '#FFFFFF',
  time: 'rgba(255,255,255,0.75)',
  bar: 'rgba(255,255,255,0.30)',
  progress: '#FFFFFF',
};

const COLORS_OTHER = {
  text: TEXTO,
  time: '#555555',
  bar: 'rgba(0,0,0,0.12)',
  progress: AZUL,
};

export function MessageList({
  messages,
  mySenderId,
  listRef,
  ListHeaderComponent,
  onActions,
}: MessageListProps) {
  const renderItem = ({ item }: { item: Message }) => {
    const isSystem = item.type === 'SYSTEM';
    const isMine = item.sender_id === mySenderId;
    const palette = isMine ? COLORS_MINE : COLORS_OTHER;

    if (isSystem) {
      return (
        <View style={styles.systemBubble}>
          <Text style={styles.systemText}>{item.content}</Text>
        </View>
      );
    }

    const time = new Date(item.created_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    // El mensaje editado solo se declara como editado: el texto anterior no se
    // guarda ni se muestra en ninguna parte (regla del usuario).
    const marca = item.edited_at ? `${time} · editado` : time;

    // Los mensajes propios se pueden editar o eliminar: el menú se abre con una
    // pulsación larga y, en web (donde no hay costumbre de mantener pulsado), con
    // un clic.
    const tocable = !!onActions && isMine;
    const abrirMenu = () => onActions?.(item);

    const fila = (burbuja: React.ReactElement) =>
      tocable ? (
        <TouchableOpacity
          style={[styles.row, isMine ? styles.rowRight : styles.rowLeft]}
          onLongPress={abrirMenu}
          onPress={Platform.OS === 'web' ? abrirMenu : undefined}
          delayLongPress={400}
          activeOpacity={0.85}
        >
          {burbuja}
        </TouchableOpacity>
      ) : (
        <View style={[styles.row, isMine ? styles.rowRight : styles.rowLeft]}>{burbuja}</View>
      );

    if (item.type === 'VOICE') {
      return fila(
        <View
          style={[styles.bubble, isMine ? styles.myBubble : styles.otherBubble, styles.voiceBubble]}
        >
          <View style={styles.voiceRow}>
            <Text style={styles.voiceIcon}>🎤</Text>
            <View style={[styles.voiceBar, { backgroundColor: palette.bar }]}>
              <View style={[styles.voiceProgress, { backgroundColor: palette.progress }]} />
            </View>
            <Text style={[styles.voiceDuration, { color: palette.time }]}>
              {(item.metadata?.duration as number) || 0}s
            </Text>
          </View>
          <Text style={[styles.time, { color: palette.time }]}>{marca}</Text>
        </View>
      );
    }

    return fila(
      <View style={[styles.bubble, isMine ? styles.myBubble : styles.otherBubble]}>
        <Text style={[styles.messageText, { color: palette.text }]}>{item.content}</Text>
        <Text style={[styles.time, { color: palette.time }]}>{marca}</Text>
      </View>
    );
  };

  return (
    <FlatList
      ref={listRef}
      data={messages}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.list}
      onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      ListHeaderComponent={ListHeaderComponent}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 12 },
  /**
   * La fila es la que se pega a un lado y limita el ancho de la burbuja: antes el
   * `maxWidth` y el `alignSelf` vivían en la burbuja, pero al envolverla para
   * escuchar la pulsación larga la alineación tiene que ir en el contenedor.
   */
  row: { maxWidth: '80%', marginBottom: 8 },
  rowRight: { alignSelf: 'flex-end' },
  rowLeft: { alignSelf: 'flex-start' },
  bubble: {
    padding: 10,
    borderRadius: 12,
    elevation: 1,
  },
  myBubble: { backgroundColor: MY_BUBBLE },
  otherBubble: { backgroundColor: OTHER_BUBBLE },
  voiceBubble: { minWidth: 180 },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  voiceIcon: { fontSize: 18, marginRight: 8 },
  voiceBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    marginRight: 8,
  },
  voiceProgress: {
    width: '60%',
    height: '100%',
    borderRadius: 2,
  },
  voiceDuration: { fontSize: 12 },
  messageText: { fontSize: 15 },
  systemBubble: { alignSelf: 'center', marginVertical: 8 },
  systemText: { fontSize: 12, color: '#666', fontStyle: 'italic', textAlign: 'center' },
  time: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
});
