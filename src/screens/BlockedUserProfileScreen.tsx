import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';

import { Alert } from '../lib/alert';
import { RootStackParamList } from '../navigation/RootNavigator';
import { IconoDeAtras } from '../components/IconoDeAtras';
import { TEXTO_SUAVE, TEXTO_TENUE } from '../lib/colors';
import { desbloquearCuenta } from '../lib/database';

type ProfileNav = StackNavigationProp<RootStackParamList, 'BlockedUserProfile'>;
type ProfileRoute = RouteProp<RootStackParamList, 'BlockedUserProfile'>;

const DARK_BG = '#2D2D2D';

/**
 * La ficha de una cuenta bloqueada (0055). Antes era de mentira: mostraba «Datos del
 * conductor» y del vehículo inventados, con un «Cambiar foto de perfil» simulado que no
 * hacía nada. Ahora enseña lo real (nombre y teléfono) y lo único que se puede hacer aquí:
 * desbloquear — que sí se guarda.
 */
export function BlockedUserProfileScreen() {
  const navigation = useNavigation<ProfileNav>();
  const route = useRoute<ProfileRoute>();
  const { user } = route.params;
  const [saliendo, setSaliendo] = useState(false);

  const handleUnblock = () => {
    Alert.alert(
      'Desbloquear cuenta',
      `¿Estás seguro de desbloquear a ${user.name}? Entre ustedes volverán a verse las alertas de servicio.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desbloquear',
          onPress: () => {
            setSaliendo(true);
            desbloquearCuenta(user.id)
              .then(() => navigation.goBack())
              .catch((err) => {
                setSaliendo(false);
                // eslint-disable-next-line no-console
                console.warn('[Bloqueados] no se pudo desbloquear:', err);
                Alert.alert('No se pudo desbloquear', 'Inténtalo de nuevo en un momento.');
              });
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
        <Text style={styles.headerTitle} numberOfLines={1}>
          {user.name}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.body}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user.name.charAt(0)}</Text>
        </View>
        <Text style={styles.name}>{user.name}</Text>
        {!!user.phone && <Text style={styles.phone}>{user.phone}</Text>}
        <Text style={styles.nota}>
          {user.vista === 'CONDUCTOR'
            ? 'Este conductor no ve tus alertas de servicio.'
            : 'No ves las alertas de servicio de este proveedor.'}
        </Text>
      </View>

      {/* Desbloquear */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.unblockBtn, saliendo && styles.unblockBtnApagado]}
          onPress={handleUnblock}
          disabled={saliendo}
          accessibilityLabel="Desbloquear cuenta"
        >
          <Text style={styles.unblockText}>{saliendo ? 'Desbloqueando…' : 'Desbloquear'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
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
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  headerSpacer: { width: 36 },
  body: { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 48 },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: DARK_BG,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: { color: '#fff', fontSize: 38, fontWeight: 'bold' },
  name: { fontSize: 20, fontWeight: 'bold', color: '#111', textAlign: 'center' },
  phone: { fontSize: 15, color: TEXTO_SUAVE, marginTop: 6 },
  nota: {
    fontSize: 13,
    color: TEXTO_TENUE,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 19,
    paddingHorizontal: 8,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  unblockBtn: {
    backgroundColor: DARK_BG,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  unblockBtnApagado: { opacity: 0.6 },
  unblockText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
