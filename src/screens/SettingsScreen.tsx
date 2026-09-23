import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { useMockStore } from '../context/MockStoreContext';
import { Alert } from '../lib/alert';
import {
  activarAvisos,
  desactivarAvisos,
  estadoDeAvisos,
  estaInstalada,
  soporteDeAvisos,
  EstadoDeAvisos,
} from '../lib/avisosWeb';
import { limpiarCacheCompleta } from '../lib/cache';
import { AZUL, ROJO_ACCION } from '../lib/colors';
import { registrarResumenEnConsola, reiniciarContadores, textoDelResumen } from '../lib/medidor';
import { limpiarCacheDeRutas } from '../lib/routes';
import { RootStackParamList } from '../navigation/RootNavigator';
import { IconoDeAtras } from '../components/IconoDeAtras';

type SettingsNav = StackNavigationProp<RootStackParamList, 'Settings'>;

const DARK_BG = '#2D2D2D';

interface MenuOption {
  id: string;
  label: string;
  route: keyof RootStackParamList;
  params?: Record<string, unknown>;
}

const MENU_OPTIONS: MenuOption[] = [
  { id: 'profile', label: 'Mi perfil', route: 'ProfileSetup' },
  { id: 'payment', label: 'Datos de pago', route: 'PaymentDetails' },
  { id: 'services', label: 'Mis servicios', route: 'MyServices' },
  { id: 'stats', label: 'Estadísticas', route: 'Estadisticas' },
  { id: 'navigation', label: 'Navegación', route: 'Navegacion' },
  { id: 'privacy', label: 'Privacidad', route: 'Privacy' },
  { id: 'membership', label: 'Membresía (30 días)', route: 'Membership' },
];

/**
 * El bloque de los avisos en el teléfono.
 *
 * Por qué está aquí: en el iPhone, los avisos de una app web necesitan permiso del usuario y que
 * se pida DESDE UN TOQUE (iOS ignora la petición si no viene de un dedo en la pantalla). Cuenta es
 * el sitio natural: el usuario entra, ve si están activos y los enciende.
 */
function BloqueDeAvisos() {
  const [estado, setEstado] = useState<EstadoDeAvisos | 'cargando'>('cargando');
  const [ocupado, setOcupado] = useState(false);
  const [soporte, setSoporte] = useState(true);
  const [instalada, setInstalada] = useState(true);

  const refrescar = useCallback(() => {
    setSoporte(soporteDeAvisos());
    setInstalada(estaInstalada());
    void estadoDeAvisos()
      .then(setEstado)
      .catch(() => setEstado('no-soportado'));
  }, []);

  useEffect(refrescar, [refrescar]);

  const activar = async () => {
    setOcupado(true);
    const resultado = await activarAvisos().catch(() => ({
      ok: false,
      estado: 'no-soportado' as EstadoDeAvisos,
      motivo: 'No se pudieron activar los avisos.',
    }));
    setOcupado(false);
    refrescar();
    if (!resultado.ok && resultado.motivo) Alert.alert('Avisos', resultado.motivo);
  };

  const desactivar = async () => {
    setOcupado(true);
    await desactivarAvisos().catch(() => undefined);
    setOcupado(false);
    refrescar();
  };

  const activos = estado === 'activo';
  let texto = 'Activar los avisos en este teléfono';
  if (estado === 'activo') texto = 'Avisos activados: toca para desactivarlos';
  else if (estado === 'denegado') texto = 'Los avisos están bloqueados en el navegador';
  else if (estado === 'no-soportado') texto = 'Este navegador no puede recibir avisos';

  return (
    <View style={styles.avisosBloque}>
      <Text style={styles.avisosTitulo}>Avisos</Text>
      <Text style={styles.avisosDetalle}>
        Alertas de servicios, reportes del conductor y mensajes de tus chats.
      </Text>
      {!instalada && soporte && (
        <Text style={styles.avisosAviso}>
          En el iPhone, añade la app a la pantalla de inicio para que los avisos funcionen.
        </Text>
      )}
      <TouchableOpacity
        style={[styles.avisosBoton, activos && styles.avisosBotonActivo]}
        onPress={() => void (activos ? desactivar() : activar())}
        disabled={
          ocupado || estado === 'cargando' || estado === 'no-soportado' || estado === 'denegado'
        }
        activeOpacity={0.75}
      >
        <MaterialCommunityIcons
          name={activos ? 'bell-off-outline' : 'bell-outline'}
          size={18}
          color={activos ? '#FFFFFF' : DARK_BG}
        />
        <Text style={[styles.avisosBotonTexto, activos && styles.avisosBotonTextoActivo]}>
          {ocupado ? 'Un momento…' : texto}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export function SettingsScreen() {
  const navigation = useNavigation<SettingsNav>();
  const { userProfile } = useMockStore();
  const { signOut } = useAuth();
  const [saliendo, setSaliendo] = useState(false);

  /**
   * Cerrar sesión (el usuario preguntó el 21-09-2026: «¿cómo se cierra la sesión?»).
   *
   * La función existía desde el principio, pero NINGUNA pantalla la ofrecía: en el teléfono no
   * había forma de salir de la cuenta. Va al final de Cuenta, en rojo y pidiendo confirmación —
   * cerrar la sesión deja el teléfono listo para otra cuenta y borra lo guardado en él.
   */
  const cerrarSesion = async () => {
    setSaliendo(true);
    try {
      await signOut();
    } finally {
      setSaliendo(false);
    }
  };

  const confirmarCerrarSesion = () => {
    Alert.alert(
      'Cerrar sesión',
      'Se cerrará tu sesión en este teléfono y tendrás que volver a entrar con tu número. ¿Continuamos?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar sesión', style: 'destructive', onPress: () => void cerrarSesion() },
      ]
    );
  };

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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <IconoDeAtras />
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
          {MENU_OPTIONS.map((option, index) => {
            // El botón de Membresía va entero en azul de la marca, con el texto y la
            // flecha en blanco (pedido del usuario, 18-09-2026).
            const esMembresia = option.id === 'membership';
            return (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.menuItem,
                  index !== MENU_OPTIONS.length - 1 && styles.menuItemBorder,
                  esMembresia && styles.menuItemMembresia,
                ]}
                onPress={() => handleNavigate(option.route, option.params)}
                activeOpacity={0.7}
              >
                <Text style={[styles.menuLabel, esMembresia && styles.menuLabelMembresia]}>
                  {option.label}
                </Text>
                <Text style={[styles.menuArrow, esMembresia && styles.menuArrowMembresia]}>
                  &gt;
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Los avisos del teléfono (Web Push, migración 0028) */}
        <BloqueDeAvisos />

        {/* Cerrar sesión: al final y en rojo, porque deja el teléfono listo para otra cuenta. */}
        <TouchableOpacity
          style={styles.cerrarSesion}
          onPress={confirmarCerrarSesion}
          disabled={saliendo}
          activeOpacity={0.75}
          accessibilityLabel="Cerrar sesión"
        >
          <Text style={styles.cerrarSesionTexto}>
            {saliendo ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </Text>
        </TouchableOpacity>

        {/* Diagnóstico de llamadas externas: solo en desarrollo */}
        {__DEV__ && (
          <TouchableOpacity style={styles.devItem} onPress={mostrarMedidor} activeOpacity={0.7}>
            <Text style={styles.devIcon}>📉</Text>
            <Text style={styles.menuLabel}>Llamadas a Google (dev)</Text>
            <Text style={styles.menuArrow}>&gt;</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  avisosBloque: { marginTop: 18, paddingHorizontal: 4 },
  avisosTitulo: { fontSize: 15, fontWeight: '700', color: DARK_BG },
  avisosDetalle: { fontSize: 13, color: '#666', marginTop: 2 },
  avisosAviso: { fontSize: 12, color: ROJO_ACCION, marginTop: 6 },
  avisosBoton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DARK_BG,
    backgroundColor: '#FFFFFF',
  },
  avisosBotonActivo: { backgroundColor: DARK_BG },
  avisosBotonTexto: { fontSize: 14, fontWeight: '600', color: DARK_BG },
  avisosBotonTextoActivo: { color: '#FFFFFF' },
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
    paddingBottom: 16,
    paddingHorizontal: 16,
    minHeight: 102,
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
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
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
  /* Membresía: la fila completa en azul, con el texto y la flecha en blanco. */
  menuItemMembresia: {
    backgroundColor: AZUL,
  },
  menuLabelMembresia: {
    color: '#fff',
    fontWeight: '600',
  },
  menuArrowMembresia: {
    color: '#fff',
  },
  devIcon: {
    fontSize: 20,
    marginRight: 16,
    width: 28,
    textAlign: 'center',
  },
  cerrarSesion: {
    marginHorizontal: 20,
    marginTop: 22,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ROJO_ACCION,
    paddingVertical: 15,
    alignItems: 'center',
  },
  cerrarSesionTexto: {
    color: ROJO_ACCION,
    fontSize: 16,
    fontWeight: 'bold',
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
