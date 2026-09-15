import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

export type AttachmentType = 'photo' | 'camera' | 'location' | 'contact';

interface ChatInputBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onSendVoice: () => void;
  onAttachment: (type: AttachmentType) => void;
  placeholder?: string;
}

const ATTACHMENT_OPTIONS: { type: AttachmentType; icon: string; label: string }[] = [
  { type: 'photo', icon: '\ud83d\uddbc\ufe0f', label: 'Fotos' },
  { type: 'camera', icon: '\ud83d\udcf7', label: 'C\u00e1mara' },
  { type: 'location', icon: '\ud83d\udccd', label: 'Ubicaci\u00f3n' },
  { type: 'contact', icon: '\ud83d\udc64', label: 'Contacto' },
];

export function ChatInputBar({
  value,
  onChangeText,
  onSend,
  onSendVoice,
  onAttachment,
  placeholder = 'Escribe un mensaje...',
}: ChatInputBarProps) {
  const [menuVisible, setMenuVisible] = useState(false);

  const hasText = value.trim().length > 0;

  const toggleMenu = () => setMenuVisible((v) => !v);
  const closeMenu = () => setMenuVisible(false);

  const handleAttachment = (type: AttachmentType) => {
    onAttachment(type);
    closeMenu();
  };

  return (
    <View style={styles.wrapper}>
      {menuVisible && (
        <View style={styles.menu}>
          {ATTACHMENT_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.type}
              style={styles.menuItem}
              onPress={() => handleAttachment(option.type)}
              activeOpacity={0.7}
            >
              <View style={styles.menuIconCircle}>
                <Text style={styles.menuIcon}>{option.icon}</Text>
              </View>
              <Text style={styles.menuLabel}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.bar}>
        <TouchableOpacity style={styles.plusBtn} onPress={toggleMenu} activeOpacity={0.7}>
          <Text style={styles.plusText}>+</Text>
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#999"
          value={value}
          onChangeText={onChangeText}
          multiline
          maxLength={1000}
        />

        <TouchableOpacity
          style={styles.cameraBtn}
          onPress={() => handleAttachment('camera')}
          activeOpacity={0.7}
        >
          <Text style={styles.cameraIcon}>📷</Text>
        </TouchableOpacity>

        {hasText ? (
          <TouchableOpacity
            style={[styles.actionBtn, styles.blueBtn]}
            onPress={onSend}
            activeOpacity={0.7}
          >
            <Text style={styles.actionIcon}>▶</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.actionBtn, styles.blueBtn]}
            onPress={onSendVoice}
            activeOpacity={0.7}
          >
            <Text style={styles.actionIcon}>🎤</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  menu: {
    position: 'absolute',
    bottom: 58,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 100,
  },
  menuItem: {
    alignItems: 'center',
    minWidth: 64,
  },
  menuIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#3F51B5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  menuIcon: {
    fontSize: 22,
  },
  menuLabel: {
    fontSize: 11,
    color: '#555',
    fontWeight: '600',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F2',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 0.5,
    borderTopColor: '#ddd',
  },
  plusBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  plusText: {
    fontSize: 26,
    color: '#888',
    fontWeight: '300',
    lineHeight: 28,
  },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 21,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#2D2D2D',
    maxHeight: 100,
  },
  cameraBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  cameraIcon: {
    fontSize: 20,
  },
  actionBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  blueBtn: {
    backgroundColor: '#3F51B5',
  },
  actionIcon: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
