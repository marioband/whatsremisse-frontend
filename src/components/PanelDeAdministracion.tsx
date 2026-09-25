import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

import { IconoDeAtras } from './IconoDeAtras';
import { useAuth } from '../context/AuthContext';

/**
 * Piezas compartidas por las pantallas del panel de administración.
 *
 * El candado de verdad está en la base (migración 0046: cada función del panel exige
 * `profiles.role = 'ADMIN'`). Lo de aquí es la primera capa: el apartado no se pinta para quien no
 * es administrador, así que un usuario normal no ve ni la pantalla ni un panel vacío que parezca
 * un fallo. Se llega por un enlace directo (`whatsremisse.tech/administracion`), que no aparece en
 * ningún menú.
 */

const DARK_BG = '#2D2D2D';

/** ¿La cuenta que tiene la sesión es administradora? */
export function useEsAdministrador(): boolean {
  const { profile } = useAuth();
  return String(profile?.role || '').toUpperCase() === 'ADMIN';
}

/** La cabecera oscura de la app, con su flecha de atrás. */
export function CabeceraDelPanel({ titulo }: { titulo: string }) {
  const navigation = useNavigation();
  return (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.backBtn}
        accessibilityLabel="Atrás"
        accessibilityRole="button"
      >
        <IconoDeAtras />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{titulo}</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

/** Lo que ve quien abre el enlace sin ser administrador. */
export function PantallaSoloAdministradores() {
  return (
    <View style={styles.container}>
      <CabeceraDelPanel titulo="Administración" />
      <View style={styles.sinPermiso}>
        <Text style={styles.sinPermisoTitulo}>Esta sección es solo para administradores</Text>
        <Text style={styles.sinPermisoTexto}>
          Si tendrías que poder entrar, revisa que tu cuenta tenga el rol de administrador.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
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
  // Igual que el resto de las cabeceras de la app (`pruebas_cabeceras_y_campos.js` las compara
  // todas): mismas medidas, mismo negro y el mismo `#fff` en minúscula.
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', flex: 1, textAlign: 'center' },
  headerSpacer: { width: 36 },
  sinPermiso: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  sinPermisoTitulo: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#111111',
    textAlign: 'center',
    marginBottom: 8,
  },
  sinPermisoTexto: { fontSize: 14, color: '#444444', textAlign: 'center', lineHeight: 21 },
});
