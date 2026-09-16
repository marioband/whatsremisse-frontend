import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

interface ChatHeaderProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  onSettings: () => void;
  /** Búsqueda dentro del chat: la lupa abre el campo y filtra los mensajes. */
  searchOpen?: boolean;
  query?: string;
  onChangeQuery?: (text: string) => void;
  onToggleSearch?: () => void;
  /** Cuántos mensajes coinciden (solo se muestra mientras se busca). */
  resultCount?: number;
}

const DARK_HEADER = '#2D2D2D';

export function ChatHeader({
  title,
  subtitle,
  onBack,
  onSettings,
  searchOpen = false,
  query = '',
  onChangeQuery,
  onToggleSearch,
  resultCount,
}: ChatHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.headerLado}>
        <TouchableOpacity onPress={onBack} accessibilityLabel="Volver">
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
      </View>

      {searchOpen ? (
        <View style={styles.searchPill}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={onChangeQuery}
            placeholder="Buscar en este chat"
            placeholderTextColor="rgba(255,255,255,0.6)"
            autoFocus
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Text style={styles.searchCount}>
              {resultCount === 0 ? 'Sin resultados' : `${resultCount}`}
            </Text>
          )}
        </View>
      ) : (
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{title || 'Chat'}</Text>
          {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
        </View>
      )}

      <View style={styles.headerIcons}>
        <TouchableOpacity onPress={onToggleSearch} accessibilityLabel="Buscar en el chat">
          <Text style={styles.headerIcon}>{searchOpen ? '✕' : '🔍'}</Text>
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
  /* Los dos laterales miden lo mismo: así el nombre de la contraparte queda
     centrado de verdad en la pantalla (con anchos distintos se desplazaba). */
  headerLado: { width: 68, justifyContent: 'center' },
  headerInfo: { flex: 1, alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 2,
    textAlign: 'center',
  },
  headerIcons: { flexDirection: 'row', width: 68, justifyContent: 'flex-end' },
  headerIcon: { color: '#fff', fontSize: 18, marginLeft: 16 },
  searchPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 18,
    paddingHorizontal: 10,
    height: 36,
  },
  searchIcon: { color: '#fff', fontSize: 16, marginRight: 6 },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 0 },
  searchCount: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginLeft: 6 },
});
