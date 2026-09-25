import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';

import { CabeceraDelPanel, PantallaSoloAdministradores, useEsAdministrador } from '../components/PanelDeAdministracion';
import { panelUsuarios } from '../lib/database';
import {
  colorDeEstado,
  etiquetaDeMembresia,
  FILTROS,
  FiltroMembresia,
  nombreDeRol,
  nombreDeUsuario,
  problemaDelPanel,
  telefonoBonito,
  textoDeEstado,
  UsuarioDelPanel,
} from '../lib/panel';
import { RootStackParamList } from '../navigation/RootNavigator';

type PanelNav = StackNavigationProp<RootStackParamList, 'AdministracionUsuarios'>;

const DARK_BG = '#2D2D2D';

/**
 * El listado de cuentas del panel: buscar por nombre o teléfono y filtrar por el estado de la
 * membresía. Tocar una fila abre su ficha, que es donde se activa, se extiende o se quita.
 *
 * El orden lo trae la base: primero lo que pide acción (por vencer, vencidas, sin membresía).
 */
export function AdminUsuariosScreen() {
  const navigation = useNavigation<PanelNav>();
  const esAdministrador = useEsAdministrador();

  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<FiltroMembresia>('TODAS');
  const [usuarios, setUsuarios] = useState<UsuarioDelPanel[]>([]);
  const [cargando, setCargando] = useState(true);
  const [problema, setProblema] = useState<string | null>(null);

  const cargar = useCallback(
    async (texto: string, cualFiltro: FiltroMembresia) => {
      if (!esAdministrador) {
        setCargando(false);
        return;
      }
      setCargando(true);
      setProblema(null);
      try {
        setUsuarios(await panelUsuarios(texto, cualFiltro, 100));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[panel] no se pudo listar las cuentas:', err);
        setProblema(problemaDelPanel(err));
      } finally {
        setCargando(false);
      }
    },
    [esAdministrador]
  );

  useEffect(() => {
    void cargar(busqueda, filtro);
    // La búsqueda se escribe sin disparar una consulta por letra: se espera a que el texto se
    // quede quieto un momento (igual que el buscador de direcciones de la app).
  }, [cargar, filtro]);

  useEffect(() => {
    const temporizador = setTimeout(() => void cargar(busqueda, filtro), 350);
    return () => clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda]);

  if (!esAdministrador) return <PantallaSoloAdministradores />;

  const renderUsuario = ({ item }: { item: UsuarioDelPanel }) => (
    <TouchableOpacity
      style={styles.fila}
      onPress={() => navigation.navigate('AdministracionUsuario', { usuario: item })}
      accessibilityRole="button"
      accessibilityLabel={`Abrir la cuenta de ${nombreDeUsuario(item)}`}
    >
      <View style={styles.filaIzquierda}>
        <Text style={styles.nombre} numberOfLines={1}>
          {nombreDeUsuario(item)}
        </Text>
        <Text style={styles.detalle} numberOfLines={1}>
          {[telefonoBonito(item.phone), nombreDeRol(item.role)].filter(Boolean).join(' · ')}
        </Text>
        <Text style={styles.membresia}>{etiquetaDeMembresia(item)}</Text>
      </View>
      <View style={[styles.etiqueta, { backgroundColor: colorDeEstado(item.estado) }]}>
        <Text style={styles.etiquetaTexto}>{textoDeEstado(item.estado)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <CabeceraDelPanel titulo="Cuentas" />

      <View style={styles.buscador}>
        <TextInput
          style={styles.campo}
          placeholder="Buscar por nombre o teléfono"
          placeholderTextColor="#888888"
          value={busqueda}
          onChangeText={setBusqueda}
          keyboardType="default"
          autoCorrect={false}
          accessibilityLabel="Buscar cuenta"
        />
      </View>

      <View style={styles.filtros}>
        {FILTROS.map((opcion) => {
          const activo = opcion.id === filtro;
          return (
            <TouchableOpacity
              key={opcion.id}
              style={[styles.filtro, activo && styles.filtroActivo]}
              onPress={() => setFiltro(opcion.id)}
              accessibilityRole="button"
              accessibilityLabel={`Filtrar: ${opcion.etiqueta}`}
            >
              <Text style={[styles.filtroTexto, activo && styles.filtroTextoActivo]}>
                {opcion.etiqueta}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {cargando && (
        <View style={styles.cargando}>
          <ActivityIndicator color={DARK_BG} />
        </View>
      )}

      {!!problema && !cargando && (
        <View style={styles.problema}>
          <Text style={styles.problemaTexto}>{problema}</Text>
          <TouchableOpacity
            style={styles.botonReintentar}
            onPress={() => void cargar(busqueda, filtro)}
            accessibilityRole="button"
            accessibilityLabel="Reintentar"
          >
            <Text style={styles.botonReintentarTexto}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}

      {!problema && (
        <FlatList
          data={usuarios}
          keyExtractor={(item) => item.id}
          renderItem={renderUsuario}
          contentContainerStyle={styles.lista}
          ListEmptyComponent={
            cargando ? null : <Text style={styles.vacio}>No hay ninguna cuenta que coincida.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  buscador: { paddingHorizontal: 16, paddingTop: 16 },
  campo: {
    borderWidth: 1,
    borderColor: '#E2E2E2',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111111',
  },
  filtros: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  filtro: {
    borderWidth: 1,
    borderColor: '#E2E2E2',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#FFFFFF',
  },
  filtroActivo: { backgroundColor: DARK_BG, borderColor: DARK_BG },
  filtroTexto: { fontSize: 13, color: '#444444' },
  filtroTextoActivo: { color: '#FFFFFF', fontWeight: '600' },
  lista: { paddingHorizontal: 16, paddingBottom: 32 },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  filaIzquierda: { flex: 1 },
  nombre: { fontSize: 15, fontWeight: '600', color: '#111111' },
  detalle: { fontSize: 13, color: '#444444', marginTop: 2 },
  membresia: { fontSize: 12, color: '#888888', marginTop: 2 },
  etiqueta: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  etiquetaTexto: { color: '#FFFFFF', fontSize: 11, fontWeight: 'bold' },
  cargando: { paddingVertical: 24, alignItems: 'center' },
  problema: {
    margin: 16,
    borderWidth: 1,
    borderColor: '#C2333F',
    borderRadius: 10,
    padding: 14,
    backgroundColor: '#FFF5F5',
  },
  problemaTexto: { color: '#C2333F', fontSize: 14, lineHeight: 21 },
  botonReintentar: {
    marginTop: 12,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#C2333F',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  botonReintentarTexto: { color: '#C2333F', fontSize: 14, fontWeight: '600' },
  vacio: { fontSize: 14, color: '#888888', paddingVertical: 24, textAlign: 'center' },
});
