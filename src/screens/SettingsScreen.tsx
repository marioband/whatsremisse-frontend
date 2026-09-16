import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';

import { useMockStore } from '../context/MockStoreContext';
import { Alert } from '../lib/alert';
import { limpiarCacheCompleta } from '../lib/cache';
import { registrarResumenEnConsola, reiniciarContadores, textoDelResumen } from '../lib/medidor';
import { limpiarCacheDeRutas } from '../lib/routes';
import { RootStackParamList } from '../navigation/RootNavigator';

type SettingsNav = StackNavigationProp<RootStackParamList, 'Settings'>;

const DARK_BG = '#2D2D2D';

interface MenuOption {
  id: string;
  label: string;
  icon: string;
  route: keyof RootStackParamList;
  params?: Record<string, unknown>;
}

const MENU_OPTIONS: MenuOption[] = [
  { id: 'profile', label: 'Mi perfil', icon: '👤', route: 'ProfileSetup' },
  { id: 'payment', label: 'Datos de pago', icon: '💳', route: 'PaymentDetails' },
  { id: 'services', label: 'Mis servicios', icon: '🚗', route: 'MyServices' },
  { id: 'stats', label: 'Estadísticas', icon: '📊', route: 'Estadisticas' },
  { id: 'privacy', label: 'Privacidad', icon: '🔒', route: 'Privacy' },
  { id: 'membership', label: 'Membresía (30 días)', icon: '🎫', route: 'Membership' },
];

export function SettingsScreen() {
  const navigation = useNavigation<SettingsNav>();
  const { userProfile } = useMockStore();

  const fullName = userProfile
    ? `${userProfile.firstName} ${userProfile.lastName}`.trim()
    : 'Usuario';

  const handleNavigate = (route: keyof RootStackParamList, params?: Record<string, unknown>) => {
    // @ts-ignore - navegación dinámica a rutas registradas
    navigation.navigate(route, params);
  };

  /**
   * Diagnóstico de llamadas externas (solo en desarrollo): muestra cuántas
   * llamadas a Google se hicieron y cuántas se evitaron. Es la forma de comprobar
   * que el crecimiento de alertas y posiciones no dispara el costo.
   */
  const mostrarMedidor = () => {
    registrarResumenEnConsola();
    Alert.alert(
      'Llamadas externas (dev)',
      `${textoDelResumen()}\n\nAl cerrar se reinicia el contador y se borra la caché de rutas.`,
      [
        { text: 'Cerrar', style: 'cancel' },
        {
          text: 'Reiniciar',
          onPress: () => {
            reiniciarContadores();
            limpiarCacheDeRutas();
            limpiarCacheCompleta();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cuenta</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* Profile header */}
        <View style={styles.profileSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{fullName.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.profileName}>{fullName}</Text>
          <Text style={styles.profileSubtitle}>Configuración de la cuenta</Text>
        </View>

        {/* Menu options */}
        <View style={styles.menuContainer}>
          {MENU_OPTIONS.map((option, index) => (
            <TouchableOpacity
              key={option.id}
              style={[styles.menuItem, index !== MENU_OPTIONS.length - 1 && styles.menuItemBorder]}
              onPress={() => handleNavigate(option.route, option.params)}
              activeOpacity={0.7}
            >
              <Text style={styles.menuIcon}>{option.icon}</Text>
              <Text style={styles.menuLabel}>{option.label}</Text>
              <Text style={styles.menuArrow}>&gt;</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Diagnóstico de llamadas externas: solo en desarrollo */}
        {__DEV__ && (
          <TouchableOpacity style={styles.devItem} onPress={mostrarMedidor} activeOpacity={0.7}>
            <Text style={styles.menuIcon}>📉</Text>
            <Text style={styles.menuLabel}>Llamadas a Google (dev)</Text>
            <Text style={styles.menuArrow}>&gt;</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: DARK_BG,
    paddingTop: 50,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  backArrow: {
    color: '#fff',
    fontSize: 24,
    marginRight: 12,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 36,
  },
  body: {
    flex: 1,
    backgroundColor: '#fff',
  },
  bodyContent: {
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: DARK_BG,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
  },
  profileName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111',
    textAlign: 'center',
  },
  profileSubtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
  },
  menuContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#eee',
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  menuIcon: {
    fontSize: 20,
    marginRight: 16,
    width: 28,
    textAlign: 'center',
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    color: '#111',
  },
  menuArrow: {
    fontSize: 18,
    color: '#aaa',
    fontWeight: '300',
  },
  devItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
});
