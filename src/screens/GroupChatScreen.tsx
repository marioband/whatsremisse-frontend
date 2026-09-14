import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';

import { ChatInputBar, AttachmentType } from '../components/ChatInputBar';
import { useAuth } from '../context/AuthContext';
import { useMockStore } from '../context/MockStoreContext';
import { useRealtimeMessages } from '../hooks/useRealtimeMessages';
import { ChatMessage, fetchMessagesForGroup, insertMessage } from '../lib/database';
import { RootStackParamList } from '../navigation/RootNavigator';

type GroupChatNav = StackNavigationProp<RootStackParamList, 'GroupChat' | 'Settings'>;
type GroupChatRoute = RouteProp<RootStackParamList, 'GroupChat'>;

const DARK_BG = '#2D2D2D';

export function GroupChatScreen() {
  const navigation = useNavigation<GroupChatNav>();
  const route = useRoute<GroupChatRoute>();
  const { groupId, groupName } = route.params;
  const { session } = useAuth();
  const { emitChatNotification } = useMockStore();

  const userId = session?.user?.id ?? '';

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

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

  useRealtimeMessages(
    groupId,
    useCallback((msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    }, [])
  );

  const handleSend = async () => {
    if (!input.trim() || !userId) return;
    const content = input.trim();
    setInput('');
    try {
      const msg = await insertMessage(groupId, userId, content, 'TEXT');
      setMessages((prev) => [...prev, msg]);
      emitChatNotification(`Nuevo mensaje en ${groupName}`, content, {
        groupId,
        groupName,
        type: 'GROUP_CHAT',
      });
    } catch {
      Alert.alert('Error', 'No se pudo enviar el mensaje.');
      setInput(content);
    }
  };

  const handleSendVoice = async () => {
    if (!userId) return;
    const content = '🎤 Nota de voz (0:03)';
    try {
      const msg = await insertMessage(groupId, userId, content, 'VOICE');
      setMessages((prev) => [...prev, msg]);
      emitChatNotification(`Nueva nota de voz en ${groupName}`, content, {
        groupId,
        groupName,
        type: 'GROUP_CHAT',
      });
      Alert.alert('Nota de voz', 'Enviada nota de voz de 3 segundos.');
    } catch {
      Alert.alert('Error', 'No se pudo enviar la nota de voz.');
    }
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
    try {
      const msg = await insertMessage(
        groupId,
        userId,
        content,
        type.toUpperCase() as ChatMessage['type']
      );
      setMessages((prev) => [...prev, msg]);
      emitChatNotification(`Nuevo contenido en ${groupName}`, content, {
        groupId,
        groupName,
        type: 'GROUP_CHAT',
      });
    } catch {
      Alert.alert('Error', 'No se pudo enviar el contenido.');
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
    return (
      <View style={[styles.bubbleRow, isMe ? styles.rowRight : styles.rowLeft]}>
        {!isMe && <Text style={styles.senderName}>{item.sender_name}</Text>}
        <View style={[styles.bubble, isMe ? styles.bubbleRight : styles.bubbleLeft]}>
          <Text style={styles.bubbleText}>{item.content}</Text>
          <Text style={styles.bubbleTime}>
            {new Date(item.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
      </View>
    );
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
          <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
            <Text style={styles.headerIcon}>⚙</Text>
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

        <ChatInputBar
          value={input}
          onChangeText={setInput}
          onSend={handleSend}
          onSendVoice={handleSendVoice}
          onAttachment={handleAttachment}
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
  headerIcon: {
    color: '#fff',
    fontSize: 18,
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
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    borderWidth: 0.5,
    borderColor: '#e5e5e5',
  },
  bubbleRight: {
    backgroundColor: '#DCF8C6',
    borderBottomRightRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    color: '#2D2D2D',
    lineHeight: 20,
  },
  bubbleTime: {
    fontSize: 10,
    color: '#888',
    alignSelf: 'flex-end',
    marginTop: 4,
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
});
