import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, ActivityIndicator } from 'react-native';

import { CabeceraDelPanel, PantallaSoloAdministradores, useEsAdministrador } from '../components/PanelDeAdministracion';
import { Alert } from '../lib/alert';
import { panelAcciones, panelModoPruebas, panelResumen } from '../lib/database';
import {
  AccionDelPanel,
  avisoDeModoPruebas,
  detalleDeAccion,
  fechaCorta,
  problemaDelPanel,
  resumenEnFilas,
  ResumenDelPanel,
  textoDeAccion,
  telefonoBonito,
} from '../lib/panel';
import { RootStackParamList } from '../navigation/RootNavigator';

type PanelNav = StackNavigationProp<RootStackParamList, 'Administracion'>;

/**
 * Panel de administración: los números de la plataforma, el interruptor «modo pruebas / modo real»
 * y el registro de lo que se ha tocado.
 *
 * Se llega por el enlace directo (`whatsremisse.tech/administracion`) y no aparece en ningún menú.
 * Todas las cifras vienen de `panel_resumen()`, que la base solo contesta a un administrador.
 */
export function AdminScreen() {
  const navigation = useNavigation<PanelNav>();
  const esAdministrador = useEsAdministrador();

  const [resumen, setResumen] = useState<ResumenDelPanel | null>(null);
  const [acciones, setAcciones] = useState<AccionDelPanel[]>([]);
  const [cargando, setCargando] = useState(true);
  const [problema, setProblema] = useState<string | null>(null);
  const [cambiandoModo, setCambiandoModo] = useState(false);

  const cargar = useCallback(async () => {
    if (!esAdministrador) {
      setCargando(false);
      return;
    }
    setCargando(true);
    setProblema(null);
    try {
      const [nuevoResumen, nuevasAcciones] = await Promise.all([panelResumen(), panelAcciones(20)]);
      setResumen(nuevoResumen);
      setAcciones(nuevasAcciones);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[panel] no se pudo cargar el resumen:', err);
      setProblema(problemaDelPanel(err));
    } finally {
      setCargando(false);
    }
  }, [esAdministrador]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (!esAdministrador) return <PantallaSoloAdministradores />;

  const modoPruebas = resumen?.modo_pruebas !== false;

  const cambiarModo = (encender: boolean) => {
    const titulo = encender ? 'Volver al modo pruebas' : 'Pasar a modo real';
    Alert.alert(titulo, avisoDeModoPruebas(encender), [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: encender ? 'Sí, modo pruebas' : 'Sí, modo real',
        onPress: () => {
          setCambiandoModo(true);
          panelModoPruebas(encender)
            .then(() => cargar())
            .catch((err) => {
              // eslint-disable-next-line no-console
              console.warn('[panel] no se pudo cambiar el modo:', err);
              Alert.alert('No se pudo cambiar', problemaDelPanel(err));
            })
            .finally(() => setCambiandoModo(false));
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <CabeceraDelPanel titulo="Administración" />

      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity
          style={styles.botonLista}
          onPress={() => navigation.navigate('AdministracionUsuarios')}
          accessibilityRole="button"
          accessibilityLabel="Ver cuentas"
        >
          <Text style={styles.botonListaTexto}>Ver cuentas y membresías</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.botonLista}
          onPress={() => navigation.navigate('AdministracionGrupos')}
          accessibilityRole="button"
          accessibilityLabel="Ver grupos"
        >
          <Text style={styles.botonListaTexto}>Grupos y carga de integrantes</Text>
        </TouchableOpacity>

        {cargando && (
          <View style={styles.cargando}>
            <ActivityIndicator color={DARK_BG} />
            <Text style={styles.cargandoTexto}>Leyendo los números…</Text>
          </View>
        )}

        {!!problema && !cargando && (
          <View style={styles.problema}>
            <Text style={styles.problemaTexto}>{problema}</Text>
            <TouchableOpacity
              style={styles.botonReintentar}
              onPress={() => void cargar()}
              accessibilityRole="button"
              accessibilityLabel="Reintentar"
            >
              <Text style={styles.botonReintentarTexto}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        )}

        {!!resumen && !problema && (
          <>
            <View style={styles.interruptor}>
              <View style={styles.interruptorTexto}>
                <Text style={styles.interruptorTitulo}>Modo pruebas</Text>
                <Text style={styles.interruptorAviso}>{avisoDeModoPruebas(modoPruebas)}</Text>
              </View>
              <Switch
                value={modoPruebas}
                onValueChange={cambiarModo}
                disabled={cambiandoModo}
                accessibilityLabel="Modo pruebas"
              />
            </View>

            <Text style={styles.seccion}>Números de ahora</Text>
            <View style={styles.tabla}>
              {resumenEnFilas(resumen).map((fila) => (
                <View key={fila.etiqueta} style={styles.fila}>
                  <View style={styles.filaIzquierda}>
                    <Text style={[styles.filaEtiqueta, fila.destacado && styles.filaEtiquetaDestacada]}>
                      {fila.etiqueta}
                    </Text>
                    <Text style={styles.filaNota}>{fila.nota}</Text>
                  </View>
                  <Text style={[styles.filaValor, fila.destacado && styles.filaValorDestacado]}>
                    {fila.valor}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={styles.seccion}>Lo último que se hizo</Text>
            {acciones.length === 0 ? (
              <Text style={styles.vacio}>Todavía no se ha tocado ninguna membresía.</Text>
            ) : (
              acciones.map((accion) => (
                <View key={accion.id} style={styles.accion}>
                  <Text style={styles.accionTitulo}>
                    {textoDeAccion(accion.accion)}
                    {accion.usuario_phone ? ` · ${telefonoBonito(accion.usuario_phone)}` : ''}
                  </Text>
                  <Text style={styles.accionDetalle}>
                    {[detalleDeAccion(accion.accion, accion.detalle), fechaCorta(accion.creado_at)]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              ))
            )}

            <TouchableOpacity
              style={styles.botonRecargar}
              onPress={() => void cargar()}
              accessibilityRole="button"
              accessibilityLabel="Actualizar los números"
            >
              <Text style={styles.botonRecargarTexto}>Actualizar</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const DARK_BG = '#2D2D2D';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 16, paddingBottom: 48 },
  botonLista: {
    backgroundColor: DARK_BG,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  botonListaTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  cargando: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  cargandoTexto: { color: '#444444', fontSize: 14 },
  problema: {
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
  interruptor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E2E2E2',
    borderRadius: 10,
    padding: 14,
    backgroundColor: '#F2F2F2',
  },
  interruptorTexto: { flex: 1 },
  interruptorTitulo: { fontSize: 15, fontWeight: 'bold', color: '#111111', marginBottom: 4 },
  interruptorAviso: { fontSize: 12, color: '#444444', lineHeight: 18 },
  seccion: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#888888',
    textTransform: 'uppercase',
    marginTop: 24,
    marginBottom: 8,
  },
  tabla: { borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 10, overflow: 'hidden' },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
    gap: 12,
  },
  filaIzquierda: { flex: 1 },
  filaEtiqueta: { fontSize: 14, color: '#111111' },
  filaEtiquetaDestacada: { fontWeight: 'bold' },
  filaNota: { fontSize: 12, color: '#888888', marginTop: 2 },
  filaValor: { fontSize: 20, fontWeight: 'bold', color: '#111111' },
  filaValorDestacado: { color: '#B8860B' },
  vacio: { fontSize: 14, color: '#888888' },
  accion: {
    borderLeftWidth: 3,
    borderLeftColor: '#3F51B5',
    paddingLeft: 10,
    paddingVertical: 8,
  },
  accionTitulo: { fontSize: 14, color: '#111111', fontWeight: '600' },
  accionDetalle: { fontSize: 12, color: '#888888', marginTop: 2 },
  botonRecargar: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: DARK_BG,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  botonRecargarTexto: { color: DARK_BG, fontSize: 15, fontWeight: '600' },
});
