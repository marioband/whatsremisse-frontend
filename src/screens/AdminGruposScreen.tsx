import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';

import {
  BuscadorDeCuenta,
  CabeceraDelPanel,
  PantallaSoloAdministradores,
  useEsAdministrador,
} from '../components/PanelDeAdministracion';
import { Alert } from '../lib/alert';
import { panelCrearGrupo, panelGrupos } from '../lib/database';
import {
  GrupoDelPanel,
  problemaDelPanel,
  resumenDelGrupo,
  telefonoBonito,
  UsuarioDelPanel,
} from '../lib/panel';
import { RootStackParamList } from '../navigation/RootNavigator';

type PanelNav = StackNavigationProp<RootStackParamList, 'AdministracionGrupos'>;

const DARK_BG = '#2D2D2D';

/**
 * Los grupos de la plataforma, desde el panel: buscarlos, ver cuántos integrantes tienen y crear uno
 * nuevo (con su dueño). Al abrir un grupo se cargan sus integrantes desde el archivo de teléfonos.
 */
export function AdminGruposScreen() {
  const navigation = useNavigation<PanelNav>();
  const esAdministrador = useEsAdministrador();

  const [busqueda, setBusqueda] = useState('');
  const [grupos, setGrupos] = useState<GrupoDelPanel[]>([]);
  const [cargando, setCargando] = useState(true);
  const [problema, setProblema] = useState<string | null>(null);

  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [dueno, setDueno] = useState<UsuarioDelPanel | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(
    async (texto: string) => {
      if (!esAdministrador) {
        setCargando(false);
        return;
      }
      setCargando(true);
      setProblema(null);
      try {
        setGrupos(await panelGrupos(texto, 100));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[panel] no se pudieron listar los grupos:', err);
        setProblema(problemaDelPanel(err));
      } finally {
        setCargando(false);
      }
    },
    [esAdministrador]
  );

  useEffect(() => {
    const temporizador = setTimeout(() => void cargar(busqueda), 350);
    return () => clearTimeout(temporizador);
  }, [busqueda, cargar]);

  if (!esAdministrador) return <PantallaSoloAdministradores />;

  const crear = () => {
    if (!dueno) {
      Alert.alert('Falta el dueño', 'Busca y elige la cuenta que va a ser dueña del grupo.');
      return;
    }
    if (!nombre.trim()) {
      Alert.alert('Falta el nombre', 'Ponle un nombre al grupo.');
      return;
    }
    Alert.alert(
      'Crear el grupo',
      `Se creará «${nombre.trim()}» con ${telefonoBonito(dueno.phone)} como dueño. Los integrantes se cargan después, desde el archivo.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, crear',
          onPress: () => {
            setGuardando(true);
            panelCrearGrupo(nombre.trim(), dueno.id)
              .then((creado) => {
                setNombre('');
                setDueno(null);
                setCreando(false);
                void cargar(busqueda);
                navigation.navigate('AdministracionGrupo', {
                  grupo: { id: creado.id, nombre: creado.nombre },
                });
              })
              .catch((err) => {
                // eslint-disable-next-line no-console
                console.warn('[panel] no se pudo crear el grupo:', err);
                Alert.alert('No se pudo crear', problemaDelPanel(err));
              })
              .finally(() => setGuardando(false));
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <CabeceraDelPanel titulo="Grupos" />

      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity
          style={styles.boton}
          onPress={() => {
            setCreando((valor) => !valor);
            setNombre('');
            setDueno(null);
          }}
          accessibilityRole="button"
          accessibilityLabel="Crear un grupo"
        >
          <Text style={styles.botonTexto}>{creando ? 'Cancelar' : 'Crear un grupo'}</Text>
        </TouchableOpacity>

        {creando && (
          <View style={styles.formulario}>
            <Text style={styles.etiqueta}>Nombre del grupo</Text>
            <TextInput
              style={styles.campo}
              placeholder="Por ejemplo: Taxi el Polo"
              placeholderTextColor="#888888"
              value={nombre}
              onChangeText={setNombre}
              editable={!guardando}
              accessibilityLabel="Nombre del grupo"
            />

            {dueno ? (
              <View style={styles.elegido}>
                <View>
                  <Text style={styles.elegidoTitulo}>Dueño: {dueno.full_name || 'cuenta sin nombre'}</Text>
                  <Text style={styles.elegidoTelefono}>{telefonoBonito(dueno.phone)}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setDueno(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Cambiar el dueño"
                >
                  <Text style={styles.cambiar}>cambiar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <BuscadorDeCuenta
                etiqueta="Dueño del grupo"
                ayuda="El grupo vive de una cuenta: es quien lo ve en su app como «Mis grupos»."
                onElegir={setDueno}
                deshabilitado={guardando}
              />
            )}

            <TouchableOpacity
              style={[styles.boton, guardando && styles.botonApagado]}
              onPress={crear}
              disabled={guardando}
              accessibilityRole="button"
              accessibilityLabel="Crear el grupo ahora"
            >
              <Text style={styles.botonTexto}>{guardando ? 'Creando…' : 'Crear el grupo'}</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.etiqueta}>Buscar</Text>
        <TextInput
          style={styles.campo}
          placeholder="Nombre del grupo o teléfono del dueño"
          placeholderTextColor="#888888"
          value={busqueda}
          onChangeText={setBusqueda}
          autoCorrect={false}
          accessibilityLabel="Buscar grupo"
        />

        {cargando && <ActivityIndicator color={DARK_BG} style={{ marginTop: 16 }} />}

        {!!problema && !cargando && (
          <View style={styles.problema}>
            <Text style={styles.problemaTexto}>{problema}</Text>
            <TouchableOpacity
              style={styles.botonReintentar}
              onPress={() => void cargar(busqueda)}
              accessibilityRole="button"
              accessibilityLabel="Reintentar"
            >
              <Text style={styles.botonReintentarTexto}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        )}

        {!problema && !cargando && grupos.length === 0 && (
          <Text style={styles.vacio}>Todavía no hay ningún grupo. Crea el primero aquí arriba.</Text>
        )}

        {grupos.map((grupo) => (
          <TouchableOpacity
            key={grupo.id}
            style={styles.fila}
            onPress={() =>
              navigation.navigate('AdministracionGrupo', { grupo: { id: grupo.id, nombre: grupo.name } })
            }
            accessibilityRole="button"
            accessibilityLabel={`Abrir el grupo ${grupo.name}`}
          >
            <Text style={styles.filaNombre}>{grupo.name}</Text>
            <Text style={styles.filaDetalle}>{resumenDelGrupo(grupo)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 16, paddingBottom: 48 },
  boton: {
    backgroundColor: DARK_BG,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  botonApagado: { opacity: 0.5 },
  botonTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  formulario: {
    borderWidth: 1,
    borderColor: '#E2E2E2',
    borderRadius: 10,
    padding: 14,
    marginTop: 12,
    gap: 10,
  },
  etiqueta: { fontSize: 13, fontWeight: 'bold', color: '#888888', textTransform: 'uppercase', marginTop: 16 },
  campo: {
    borderWidth: 1,
    borderColor: '#E2E2E2',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111111',
  },
  elegido: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: '#F2F2F2',
    borderRadius: 10,
    padding: 12,
  },
  elegidoTitulo: { fontSize: 15, color: '#111111', fontWeight: '600' },
  elegidoTelefono: { fontSize: 13, color: '#444444', marginTop: 2 },
  cambiar: { color: '#3F51B5', fontSize: 14, fontWeight: '600' },
  problema: {
    marginTop: 16,
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
  vacio: { fontSize: 14, color: '#888888', marginTop: 16, textAlign: 'center' },
  fila: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  filaNombre: { fontSize: 16, fontWeight: '600', color: '#111111' },
  filaDetalle: { fontSize: 13, color: '#444444', marginTop: 3 },
});
