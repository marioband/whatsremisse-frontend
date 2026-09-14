import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';

import { Message } from '../../types';

interface MessageListProps {
  messages: Message[];
  mySenderId: string;
  listRef: React.RefObject<FlatList>;
  ListHeaderComponent?: React.ComponentType<any> | React.ReactElement | null;
}

const WHATSAPP_GREEN = '#075E54';

export function MessageList({
  messages,
  mySenderId,
  listRef,
  ListHeaderComponent,
}: MessageListProps) {
  const renderItem = ({ item }: { item: Message }) => {
    const isSystem = item.type === 'SYSTEM';
    const isMine = item.sender_id === mySenderId;

    if (isSystem) {
      return (
        <View style={styles.systemBubble}>
          <Text style={styles.systemText}>{item.content}</Text>
        </View>
      );
    }

    if (item.type === 'VOICE') {
      return (
        <View
          style={[styles.bubble, isMine ? styles.myBubble : styles.otherBubble, styles.voiceBubble]}
        >
          <View style={styles.voiceRow}>
            <Text style={styles.voiceIcon}>🎤</Text>
            <View style={styles.voiceBar}>
              <View style={styles.voiceProgress} />
            </View>
            <Text style={styles.voiceDuration}>{(item.metadata?.duration as number) || 0}s</Text>
          </View>
          <Text style={styles.time}>
            {new Date(item.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
      );
    }

    return (
      <View style={[styles.bubble, isMine ? styles.myBubble : styles.otherBubble]}>
        <Text style={styles.messageText}>{item.content}</Text>
        <Text style={styles.time}>
          {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
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
  myBubble: { alignSelf: 'flex-end', backgroundColor: '#dcf8c6' },
  otherBubble: { alignSelf: 'flex-start', backgroundColor: '#fff' },
  voiceBubble: { minWidth: 180 },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  voiceIcon: { fontSize: 18, marginRight: 8 },
  voiceBar: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 2,
    marginRight: 8,
  },
  voiceProgress: {
    width: '60%',
    height: '100%',
    backgroundColor: WHATSAPP_GREEN,
    borderRadius: 2,
  },
  voiceDuration: { fontSize: 12, color: '#666' },
  messageText: { color: '#000', fontSize: 15 },
  systemBubble: { alignSelf: 'center', marginVertical: 8 },
  systemText: { fontSize: 12, color: '#666', fontStyle: 'italic', textAlign: 'center' },
  time: { fontSize: 10, color: '#888', marginTop: 4, alignSelf: 'flex-end' },
});
