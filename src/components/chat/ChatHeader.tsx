import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface ChatHeaderProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  onSettings: () => void;
}

const DARK_HEADER = '#2D2D2D';

export function ChatHeader({ title, subtitle, onBack, onSettings }: ChatHeaderProps) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.backArrow}>←</Text>
      </TouchableOpacity>
      <View style={styles.headerInfo}>
        <Text style={styles.headerTitle}>{title || 'Chat'}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.headerIcons}>
        <TouchableOpacity>
          <Text style={styles.headerIcon}>🔍</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onSettings}>
          <Text style={styles.headerIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DARK_HEADER,
    paddingTop: 50,
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  backArrow: { color: '#fff', fontSize: 24, marginRight: 12 },
  headerInfo: { flex: 1 },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  headerSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  headerIcons: { flexDirection: 'row' },
  headerIcon: { color: '#fff', fontSize: 18, marginLeft: 16 },
});
