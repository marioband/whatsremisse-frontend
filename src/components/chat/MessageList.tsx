import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';

import { AZUL, TEXTO } from '../../lib/colors';
import { Message } from '../../types';

interface MessageListProps {
  messages: Message[];
  mySenderId: string;
  listRef: React.RefObject<FlatList>;
  ListHeaderComponent?: React.ComponentType<any> | React.ReactElement | null;
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

    if (item.type === 'VOICE') {
      return (
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
          <Text style={[styles.time, { color: palette.time }]}>{time}</Text>
        </View>
      );
    }

    return (
      <View style={[styles.bubble, isMine ? styles.myBubble : styles.otherBubble]}>
        <Text style={[styles.messageText, { color: palette.text }]}>{item.content}</Text>
        <Text style={[styles.time, { color: palette.time }]}>{time}</Text>
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
  bubble: {
    maxWidth: '80%',
    padding: 10,
    borderRadius: 12,
    marginBottom: 8,
    elevation: 1,
  },
  myBubble: { alignSelf: 'flex-end', backgroundColor: MY_BUBBLE },
  otherBubble: { alignSelf: 'flex-start', backgroundColor: OTHER_BUBBLE },
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
