import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';

import { IconoDeAtras } from './IconoDeAtras';
import { useAuth } from '../context/AuthContext';
import { panelUsuarios } from '../lib/database';
import { nombreDeUsuario, problemaDelPanel, telefonoBonito, UsuarioDelPanel } from '../lib/panel';

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

/**
 * Buscar una cuenta y elegirla (por teléfono o nombre).
 *
 * Lo usan el «dueño del grupo» y el cambio de dueño: se escribe al menos 3 letras y aparece la lista
 * de cuentas que coinciden, con su nombre y su teléfono para no confundir a dos personas.
 */
export function BuscadorDeCuenta({
  etiqueta,
  ayuda,
  onElegir,
  deshabilitado,
}: {
  etiqueta: string;
  ayuda?: string;
  onElegir: (usuario: UsuarioDelPanel) => void;
  deshabilitado?: boolean;
}) {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<UsuarioDelPanel[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [problema, setProblema] = useState<string | null>(null);

  useEffect(() => {
    const temporizador = setTimeout(async () => {
      if (texto.trim().length < 3) {
        setResultados([]);
        return;
      }
      setBuscando(true);
      setProblema(null);
      try {
        setResultados(await panelUsuarios(texto, 'TODAS', 8));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[panel] no se pudo buscar cuentas:', err);
        setProblema(problemaDelPanel(err));
      } finally {
        setBuscando(false);
      }
    }, 350);
    return () => clearTimeout(temporizador);
  }, [texto]);

  return (
    <View style={styles.buscador}>
      <Text style={styles.buscadorEtiqueta}>{etiqueta}</Text>
      <TextInput
        style={styles.buscadorCampo}
        placeholder="Teléfono o nombre (mínimo 3 letras)"
        placeholderTextColor="#888888"
        value={texto}
        onChangeText={setTexto}
        autoCorrect={false}
        editable={!deshabilitado}
        accessibilityLabel={etiqueta}
      />
      {!!ayuda && <Text style={styles.buscadorAyuda}>{ayuda}</Text>}
      {buscando && <ActivityIndicator color={DARK_BG} style={{ marginTop: 8 }} />}
      {!!problema && <Text style={styles.buscadorProblema}>{problema}</Text>}
      {resultados.map((usuario) => (
        <TouchableOpacity
          key={usuario.id}
          style={styles.buscadorFila}
          onPress={() => {
            setTexto('');
            setResultados([]);
            onElegir(usuario);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Elegir ${nombreDeUsuario(usuario)}`}
        >
          <Text style={styles.buscadorFilaNombre}>{nombreDeUsuario(usuario)}</Text>
          <Text style={styles.buscadorFilaTelefono}>{telefonoBonito(usuario.phone)}</Text>
        </TouchableOpacity>
      ))}
      {!buscando && texto.trim().length >= 3 && resultados.length === 0 && !problema && (
        <Text style={styles.buscadorAyuda}>Ninguna cuenta coincide con eso.</Text>
      )}
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
  buscador: { marginTop: 4 },
  buscadorEtiqueta: { fontSize: 13, fontWeight: '600', color: '#111111', marginBottom: 6 },
  buscadorCampo: {
    borderWidth: 1,
    borderColor: '#E2E2E2',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111111',
  },
  buscadorAyuda: { fontSize: 12, color: '#888888', marginTop: 6, lineHeight: 18 },
  buscadorProblema: { fontSize: 12, color: '#C2333F', marginTop: 6 },
  buscadorFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  buscadorFilaNombre: { fontSize: 15, color: '#111111', fontWeight: '600', flexShrink: 1 },
  buscadorFilaTelefono: { fontSize: 13, color: '#444444' },
  sinPermisoTitulo: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#111111',
    textAlign: 'center',
    marginBottom: 8,
  },
  sinPermisoTexto: { fontSize: 14, color: '#444444', textAlign: 'center', lineHeight: 21 },
});
