import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';

import { Icono, ICONO_AJUSTES, ICONO_BUSCAR } from '../Icono';
import { IconoDeAtras } from '../../components/IconoDeAtras';

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
        <TouchableOpacity style={styles.backBtn} onPress={onBack} accessibilityLabel="Volver">
          <IconoDeAtras />
        </TouchableOpacity>
      </View>

      {searchOpen ? (
        <View style={styles.searchPill}>
          <Icono fuente={ICONO_BUSCAR} tamano={16} estilo={styles.searchIcon} />
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
          {/* Abierta la búsqueda, el botón cierra: ahí sigue el signo ✕. */}
          {searchOpen ? (
            <Text style={styles.headerIcon}>✕</Text>
          ) : (
            <Icono fuente={ICONO_BUSCAR} tamano={20} estilo={styles.iconoHeader} />
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={onSettings} accessibilityLabel="Cuenta">
          <Icono fuente={ICONO_AJUSTES} tamano={20} estilo={styles.iconoHeader} />
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
    paddingBottom: 16,
    paddingHorizontal: 16,
    minHeight: 102,
  },
  backArrow: { color: '#fff', fontSize: 24, marginRight: 12 },
  /* Los DOS laterales miden lo mismo (68 = 68) para que el nombre de la contraparte quede
     centrado de verdad en la pantalla (con anchos distintos se desplazaba 16 px). El botón de
     atrás va en su caja de 36×36 pegada a la izquierda del hueco, así la flecha cae en el mismo
     sitio que en las otras 21 pantallas (16 + 18 = 34) aunque el hueco haga 68 para igualar los
     dos iconos de la derecha (36 = 68 no caben). 23-09-2026. */
  headerLado: { width: 68, flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerInfo: { flex: 1, alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'center', flex: 1 },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 2,
    textAlign: 'center',
  },
  headerIcons: { flexDirection: 'row', width: 68, justifyContent: 'flex-end' },
  /* Solo para el ✕ que cierra la búsqueda. */
  headerIcon: { color: '#fff', fontSize: 18, marginLeft: 16 },
  /* Los iconos (búsqueda y ajustes) son imágenes: solo llevan la separación. */
  iconoHeader: { marginLeft: 16 },
  searchPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 18,
    paddingHorizontal: 10,
    height: 36,
  },
  searchIcon: { marginRight: 6 },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    paddingVertical: 0,
    // En web el navegador dibuja su recuadro de foco (outline) en los campos: la app no
    // lo quiere (en nativo no existe).
    ...Platform.select({ web: { outlineStyle: 'none' } as object }),
  },
  searchCount: { color: 'rgba(255, 255, 0.7)', fontSize: 11, marginLeft: 6 },
});
