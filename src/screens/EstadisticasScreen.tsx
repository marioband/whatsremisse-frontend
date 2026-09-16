import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { useMockStore } from '../context/MockStoreContext';
import {
  AZUL,
  BORDE_SUAVE,
  FONDO_TARJETA,
  OSCURO,
  TEXTO,
  TEXTO_SUAVE,
  VERDE_ACCION,
} from '../lib/colors';
import { fetchPublicProfile } from '../lib/database';
import {
  FilaEstadistica,
  FILTROS_ROL,
  FiltroRol,
  filasDeEstadistica,
  moverPeriodo,
  PERIODOS,
  Periodo,
  rangoDelPeriodo,
  totalDe,
} from '../lib/estadisticas';
import { datosDesdePerfilPublico } from '../lib/perfilPublico';
import { RootStackParamList } from '../navigation/RootNavigator';

type EstadisticasNav = StackNavigationProp<RootStackParamList, 'Estadisticas'>;

/**
 * Estadísticas de ingresos (Cuenta → Estadísticas).
 *
 * Solo entran los servicios **pagados y cerrados** del período elegido, una fila
 * por servicio, con el rol que tuvo el usuario en ese servicio. Sin gráficos: la
 * tabla y su total. La lógica de períodos y de filas vive en `lib/estadisticas.ts`
 * (probable sin React).
 */
export function EstadisticasScreen() {
  const navigation = useNavigation<EstadisticasNav>();
  const { services } = useMockStore();
  const { session } = useAuth();
  const userId = session?.user?.id ?? '';

  const [periodo, setPeriodo] = useState<Periodo>('MENSUAL');
  const [referencia, setReferencia] = useState<Date>(new Date());
  const [filtro, setFiltro] = useState<FiltroRol>('TODOS');
  const [nombres, setNombres] = useState<Record<string, string>>({});

  const rango = useMemo(() => rangoDelPeriodo(periodo, referencia), [periodo, referencia]);
  const esPeriodoActual = rangoDelPeriodo(periodo, new Date()).etiqueta === rango.etiqueta;

  const filas = useMemo(
    () => filasDeEstadistica({ services, userId, periodo, referencia, filtro }),
    [services, userId, periodo, referencia, filtro]
  );
  const total = useMemo(() => totalDe(filas), [filas]);

  // El nombre del conductor contraparte no viaja en la fila del servicio: se lee
  // con `public_profile` (autoriza al proveedor con sus postulantes/asignados).
  const idsSinNombre = useMemo(
    () => [
      ...new Set(
        filas
          .filter((f) => f.rol === 'PROVEEDOR' && f.contraparteId && !nombres[f.contraparteId])
          .map((f) => f.contraparteId)
      ),
    ],
    [filas, nombres]
  );
  const claveIds = idsSinNombre.join(',');

  useEffect(() => {
    if (!claveIds) return;
    let vigente = true;
    (async () => {
      for (const id of claveIds.split(',')) {
        try {
          const resultado = await fetchPublicProfile(id);
          if (!vigente) return;
          const datos = datosDesdePerfilPublico(resultado.profile);
          const nombre = `${datos.nombres} ${datos.apellidos}`.trim();
          if (nombre) setNombres((actuales) => ({ ...actuales, [id]: nombre }));
        } catch (err) {
          console.warn('[estadisticas] sin nombre para', id, err);
        }
      }
    })();
    return () => {
      vigente = false;
    };
  }, [claveIds]);

  const nombreDeContraparte = (fila: FilaEstadistica) => {
    if (fila.rol === 'CONDUCTOR') return fila.contraparte || 'Proveedor';
    return nombres[fila.contraparteId] || 'Conductor';
  };

  const fechaCorta = (fecha: Date) =>
    `${String(fecha.getDate()).padStart(2, '0')}/${String(fecha.getMonth() + 1).padStart(2, '0')}/${fecha.getFullYear()}`;

  const renderFila = ({ item }: { item: FilaEstadistica }) => (
    <View style={styles.fila}>
      <View style={styles.filaCabecera}>
        <Text style={styles.fecha}>{fechaCorta(item.fecha)}</Text>
        <View
          style={[
            styles.etiquetaRol,
            { backgroundColor: item.rol === 'CONDUCTOR' ? AZUL : OSCURO },
          ]}
        >
          <Text style={styles.etiquetaRolTexto}>
            {item.rol === 'CONDUCTOR' ? 'Conductor' : 'Proveedor'}
          </Text>
        </View>
        <Text style={styles.monto}>S/ {item.monto.toFixed(2)}</Text>
      </View>
      <Text style={styles.contraparte} numberOfLines={1}>
        {nombreDeContraparte(item)}
      </Text>
      <Text style={styles.ruta} numberOfLines={1}>
        {item.origen} → {item.destino}
      </Text>
    </View>
  );

  const cabecera = (
    <>
      {/* Selector de período */}
      <View style={styles.periodos}>
        {PERIODOS.map((opcion) => (
          <TouchableOpacity
            key={opcion.id}
            style={[styles.periodoPill, periodo === opcion.id && styles.periodoPillActiva]}
            onPress={() => {
              setPeriodo(opcion.id);
              setReferencia(new Date());
            }}
          >
            <Text style={[styles.periodoTexto, periodo === opcion.id && styles.periodoTextoActivo]}>
              {opcion.etiqueta}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Navegación entre períodos */}
      <View style={styles.navegador}>
        <TouchableOpacity
          style={styles.flecha}
          onPress={() => setReferencia((actual) => moverPeriodo(periodo, actual, -1))}
          accessibilityLabel="Período anterior"
        >
          <Text style={styles.flechaTexto}>←</Text>
        </TouchableOpacity>

        <View style={styles.centroNavegador}>
          <Text style={styles.rangoTexto}>{rango.etiqueta}</Text>
          {!esPeriodoActual && (
            <TouchableOpacity onPress={() => setReferencia(new Date())}>
              <Text style={styles.volverHoy}>volver al actual</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.flecha}
          onPress={() => setReferencia((actual) => moverPeriodo(periodo, actual, 1))}
          accessibilityLabel="Período siguiente"
        >
          <Text style={styles.flechaTexto}>→</Text>
        </TouchableOpacity>
      </View>

      {/* Sub-filtro por rol */}
      <View style={styles.filtros}>
        {FILTROS_ROL.map((opcion) => (
          <TouchableOpacity
            key={opcion.id}
            style={[styles.filtroPill, filtro === opcion.id && styles.filtroPillActivo]}
            onPress={() => setFiltro(opcion.id)}
          >
            <Text style={[styles.filtroTexto, filtro === opcion.id && styles.filtroTextoActivo]}>
              {opcion.etiqueta}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Encabezado de la tabla */}
      <View style={styles.tablaCabecera}>
        <Text style={styles.tablaTitulo}>Servicios pagados y cerrados</Text>
        <View style={styles.tablaColumnas}>
          <Text style={[styles.columna, styles.columnaFecha]}>Fecha</Text>
          <Text style={[styles.columna, styles.columnaRol]}>Rol</Text>
          <Text style={[styles.columna, styles.columnaMonto]}>Monto</Text>
        </View>
      </View>
    </>
  );

  const pie = (
    <>
      {filas.length === 0 ? (
        <Text style={styles.vacio}>No hay servicios pagados y cerrados en este período.</Text>
      ) : (
        <View style={styles.totalFila}>
          <Text style={styles.totalEtiqueta}>
            Total del período ({filas.length} {filas.length === 1 ? 'servicio' : 'servicios'})
          </Text>
          <Text style={styles.totalMonto}>S/ {total.toFixed(2)}</Text>
        </View>
      )}
    </>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Estadísticas</Text>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        data={filas}
        keyExtractor={(item) => item.id}
        renderItem={renderFila}
        ListHeaderComponent={cabecera}
        ListFooterComponent={pie}
        contentContainerStyle={styles.lista}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: OSCURO,
    paddingTop: 50,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  backArrow: { color: '#fff', fontSize: 24, marginRight: 12 },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: { width: 36 },
  lista: { paddingBottom: 40 },
  periodos: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 16 },
  periodoPill: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 8,
    marginHorizontal: 4,
    alignItems: 'center',
    backgroundColor: FONDO_TARJETA,
  },
  periodoPillActiva: { backgroundColor: AZUL },
  periodoTexto: { fontSize: 12, fontWeight: '600', color: TEXTO_SUAVE },
  periodoTextoActivo: { color: '#fff' },
  navegador: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  flecha: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: FONDO_TARJETA,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flechaTexto: { fontSize: 18, color: TEXTO, fontWeight: '600' },
  centroNavegador: { flex: 1, alignItems: 'center' },
  rangoTexto: { fontSize: 15, fontWeight: '700', color: TEXTO },
  volverHoy: { fontSize: 11, color: AZUL, marginTop: 2 },
  filtros: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 12 },
  filtroPill: {
    borderRadius: 16,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginRight: 8,
    backgroundColor: FONDO_TARJETA,
  },
  filtroPillActivo: { backgroundColor: OSCURO },
  filtroTexto: { fontSize: 12, fontWeight: '600', color: TEXTO_SUAVE },
  filtroTextoActivo: { color: '#fff' },
  tablaCabecera: {
    backgroundColor: FONDO_TARJETA,
    marginHorizontal: 12,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
  },
  tablaTitulo: { fontSize: 13, fontWeight: '700', color: TEXTO, marginBottom: 6 },
  tablaColumnas: { flexDirection: 'row', alignItems: 'center' },
  columna: { fontSize: 10, color: TEXTO_SUAVE, fontWeight: '700' },
  columnaFecha: { flex: 1 },
  columnaRol: { width: 90 },
  columnaMonto: { width: 80, textAlign: 'right' },
  fila: {
    borderBottomWidth: 0.5,
    borderBottomColor: BORDE_SUAVE,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 12,
  },
  filaCabecera: { flexDirection: 'row', alignItems: 'center' },
  fecha: { flex: 1, fontSize: 12, color: TEXTO_SUAVE },
  etiquetaRol: {
    width: 90,
    borderRadius: 10,
    paddingVertical: 3,
    alignItems: 'center',
  },
  etiquetaRolTexto: { color: '#fff', fontSize: 10, fontWeight: '700' },
  monto: { width: 80, textAlign: 'right', fontSize: 14, fontWeight: '700', color: TEXTO },
  contraparte: { fontSize: 13, color: TEXTO, marginTop: 4 },
  ruta: { fontSize: 11, color: TEXTO_SUAVE, marginTop: 2 },
  vacio: {
    textAlign: 'center',
    color: TEXTO_SUAVE,
    fontSize: 13,
    paddingVertical: 28,
    paddingHorizontal: 24,
  },
  totalFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 12,
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: '#E8F5E9',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  totalEtiqueta: { fontSize: 13, fontWeight: '700', color: TEXTO },
  totalMonto: { fontSize: 16, fontWeight: 'bold', color: VERDE_ACCION },
});
