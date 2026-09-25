import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';

import {
  BuscadorDeCuenta,
  CabeceraDelPanel,
  PantallaSoloAdministradores,
  useEsAdministrador,
} from '../components/PanelDeAdministracion';
import { Alert } from '../lib/alert';
import { elegirArchivoDeTexto, puedeElegirArchivo } from '../lib/archivoWeb';
import {
  panelCambiarDueno,
  panelCargarIntegrantes,
  panelGrupo,
  panelQuitarIntegrante,
  panelQuitarInvitacion,
} from '../lib/database';
import {
  avisoAntesDeCargar,
  DetalleDelGrupo,
  etiquetaDelIntegrante,
  fechaCorta,
  IntegranteDelGrupo,
  InvitadoDelGrupo,
  numeroConMiles,
  problemaDelPanel,
  resumenDeLaCarga,
  telefonosDelArchivo,
  telefonoBonito,
  UsuarioDelPanel,
} from '../lib/panel';
import { RootStackParamList } from '../navigation/RootNavigator';

type PanelNav = StackNavigationProp<RootStackParamList, 'AdministracionGrupo'>;
type PanelRuta = RouteProp<RootStackParamList, 'AdministracionGrupo'>;

const DARK_BG = '#2D2D2D';

/**
 * Un grupo desde el panel: quién es el dueño, quiénes están dentro, quiénes quedaron invitados y la
 * carga de integrantes desde el archivo de teléfonos (CSV que guarda Excel).
 *
 * La carga va en dos tiempos: primero la base SIMULA y dice exactamente qué pasaría; eso se enseña y
 * solo se aplica si el administrador lo confirma. Lo simulado y lo real son la misma función, así que
 * no pueden discrepar.
 */
export function AdminGrupoScreen() {
  const navigation = useNavigation<PanelNav>();
  const { params } = useRoute<PanelRuta>();
  const esAdministrador = useEsAdministrador();

  const [detalle, setDetalle] = useState<DetalleDelGrupo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [problema, setProblema] = useState<string | null>(null);
  const [cambiandoDueno, setCambiandoDueno] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setProblema(null);
    try {
      setDetalle(await panelGrupo(params.grupo.id));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[panel] no se pudo leer el grupo:', err);
      setProblema(problemaDelPanel(err));
    } finally {
      setCargando(false);
    }
  }, [params.grupo.id]);

  useEffect(() => {
    if (esAdministrador) void cargar();
    else setCargando(false);
  }, [cargar, esAdministrador]);

  if (!esAdministrador) return <PantallaSoloAdministradores />;

  const conectar = (nombre: string, hacerlo: () => Promise<unknown>, despues?: () => void) => {
    setOcupado(true);
    setProblema(null);
    hacerlo()
      .then(async () => {
        await cargar();
        despues?.();
        Alert.alert(nombre, 'Listo.');
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn(`[panel] ${nombre}: falló`, err);
        Alert.alert('No se pudo hacer', problemaDelPanel(err));
      })
      .finally(() => setOcupado(false));
  };

  /** El camino completo de la carga: elegir el archivo, simular, confirmar y aplicar. */
  const cargarArchivo = async () => {
    if (!puedeElegirArchivo()) {
      Alert.alert(
        'Desde el teléfono no se puede',
        'El archivo se elige desde la computadora (whatsremisse.tech/administracion con tu cuenta). En el teléfono no hay forma de abrir el explorador de archivos.'
      );
      return;
    }

    const archivo = await elegirArchivoDeTexto();
    if (!archivo) return;

    const leido = telefonosDelArchivo(archivo.texto, 1000);
    if (leido.telefonos.length === 0) {
      Alert.alert(
        'No hay teléfonos en el archivo',
        `Se leyeron ${numeroConMiles(leido.lineas)} línea(s) y ninguna es un celular de 9 dígitos.\n\n` +
          `Ejemplos de lo que venía: ${leido.invalidas.slice(0, 5).join(' · ') || '(vacío)'}`
      );
      return;
    }

    const avisoDeMas = leido.sobrantes > 0
      ? `\n\nOjo: el archivo trae ${numeroConMiles(leido.sobrantes)} teléfono(s) de más y el tope es 1.000 por archivo. Esos quedan fuera; pásalos en otro archivo.`
      : '';

    setOcupado(true);
    try {
      const simulacion = await panelCargarIntegrantes(params.grupo.id, leido.telefonos, true);
      setOcupado(false);

      const ejemplos = leido.invalidas.length
        ? `\n\nNo son celulares (${numeroConMiles(leido.total_invalidos)}): ${leido.invalidas.slice(0, 5).join(' · ')}`
        : '';

      Alert.alert(
        `Archivo: ${archivo.nombre}`,
        avisoAntesDeCargar(simulacion, params.grupo.nombre) + avisoDeMas + ejemplos,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Cargar ahora',
            onPress: () => {
              setOcupado(true);
              panelCargarIntegrantes(params.grupo.id, leido.telefonos, false)
                .then(async (resultado) => {
                  await cargar();
                  Alert.alert('Carga terminada', resumenDeLaCarga(resultado));
                })
                .catch((err) => {
                  // eslint-disable-next-line no-console
                  console.warn('[panel] la carga falló:', err);
                  Alert.alert('No se pudo cargar', problemaDelPanel(err));
                })
                .finally(() => setOcupado(false));
            },
          },
        ]
      );
    } catch (err) {
      setOcupado(false);
      // eslint-disable-next-line no-console
      console.warn('[panel] no se pudo simular la carga:', err);
      Alert.alert('No se pudo leer la lista', problemaDelPanel(err));
    }
  };

  const quitarIntegrante = (integrante: IntegranteDelGrupo) => {
    Alert.alert(
      'Quitar del grupo',
      `¿Sacar a ${etiquetaDelIntegrante(integrante)} de «${params.grupo.nombre}»? La cuenta sigue existiendo; solo deja de estar en este grupo.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, quitar',
          style: 'destructive',
          onPress: () =>
            conectar('Integrante quitado', () =>
              panelQuitarIntegrante(params.grupo.id, integrante.user_id)
            ),
        },
      ]
    );
  };

  const quitarInvitacion = (invitado: InvitadoDelGrupo) => {
    Alert.alert(
      'Quitar la invitación',
      `El ${telefonoBonito(invitado.phone)} ya no entrará a este grupo cuando se registre.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, quitar',
          style: 'destructive',
          onPress: () =>
            conectar('Invitación quitada', () => panelQuitarInvitacion(invitado.id)),
        },
      ]
    );
  };

  const elegirDueno = (usuario: UsuarioDelPanel) => {
    setCambiandoDueno(false);
    Alert.alert(
      'Cambiar el dueño',
      `El grupo pasará a ser de ${usuario.full_name || telefonoBonito(usuario.phone)}. El dueño anterior se queda dentro como integrante normal.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, cambiar',
          onPress: () => conectar('Dueño cambiado', () => panelCambiarDueno(params.grupo.id, usuario.id)),
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <CabeceraDelPanel titulo={params.grupo.nombre} />

      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity
          style={[styles.boton, ocupado && styles.botonApagado]}
          onPress={() => void cargarArchivo()}
          disabled={ocupado}
          accessibilityRole="button"
          accessibilityLabel="Cargar teléfonos desde un archivo"
        >
          <Text style={styles.botonTexto}>Cargar teléfonos desde un archivo</Text>
        </TouchableOpacity>
        <Text style={styles.nota}>
          El archivo es el CSV que guarda Excel (una columna de teléfonos, hasta 1.000). Los que ya
          tienen cuenta entran al grupo en el acto; los demás quedan invitados y entran solos cuando se
          registren con ese número.
        </Text>

        {cargando && <ActivityIndicator color={DARK_BG} style={{ marginTop: 20 }} />}

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

        {!!detalle && !problema && (
          <>
            <View style={styles.ficha}>
              <Text style={styles.fichaTitulo}>Dueño</Text>
              <Text style={styles.fichaValor}>
                {detalle.dueno_nombre || 'Cuenta sin nombre'} · {telefonoBonito(detalle.dueno_phone) || 'sin teléfono'}
              </Text>
              <Text style={styles.fichaNota}>Grupo creado el {fechaCorta(detalle.creado_at) || '—'}</Text>
              <TouchableOpacity
                style={styles.botonSecundario}
                onPress={() => setCambiandoDueno((valor) => !valor)}
                accessibilityRole="button"
                accessibilityLabel="Cambiar el dueño del grupo"
              >
                <Text style={styles.botonSecundarioTexto}>
                  {cambiandoDueno ? 'Cancelar' : 'Cambiar el dueño'}
                </Text>
              </TouchableOpacity>
              {cambiandoDueno && (
                <View style={{ marginTop: 10 }}>
                  <BuscadorDeCuenta
                    etiqueta="Nuevo dueño"
                    ayuda="El nuevo dueño tiene que estar en el grupo o se agregará como dueño."
                    onElegir={elegirDueno}
                    deshabilitado={ocupado}
                  />
                </View>
              )}
            </View>

            <Text style={styles.seccion}>
              Integrantes ({numeroConMiles(detalle.integrantes.length)})
            </Text>
            {detalle.integrantes.map((integrante) => (
              <View key={integrante.user_id} style={styles.fila}>
                <View style={styles.filaIzquierda}>
                  <Text style={styles.filaNombre}>{etiquetaDelIntegrante(integrante)}</Text>
                  <Text style={styles.filaDetalle}>
                    {telefonoBonito(integrante.phone) || 'sin teléfono'}
                    {integrante.joined_at ? ` · desde ${fechaCorta(integrante.joined_at)}` : ''}
                  </Text>
                </View>
                {!integrante.es_dueno && (
                  <TouchableOpacity
                    style={styles.botonFila}
                    onPress={() => quitarIntegrante(integrante)}
                    disabled={ocupado}
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar a ${etiquetaDelIntegrante(integrante)}`}
                  >
                    <Text style={styles.botonFilaTexto}>Quitar</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            <Text style={styles.seccion}>
              Invitados que todavía no tienen cuenta ({numeroConMiles(detalle.invitados.length)})
            </Text>
            {detalle.invitados.length === 0 ? (
              <Text style={styles.vacio}>Ninguno: todos los cargados ya entraron.</Text>
            ) : (
              detalle.invitados.map((invitado) => (
                <View key={invitado.id} style={styles.fila}>
                  <View style={styles.filaIzquierda}>
                    <Text style={styles.filaNombre}>{telefonoBonito(invitado.phone)}</Text>
                    <Text style={styles.filaDetalle}>
                      invitado el {fechaCorta(invitado.creado_at) || '—'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.botonFila}
                    onPress={() => quitarInvitacion(invitado)}
                    disabled={ocupado}
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar la invitación al ${telefonoBonito(invitado.phone)}`}
                  >
                    <Text style={styles.botonFilaTexto}>Quitar</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}

            <TouchableOpacity
              style={styles.botonVolver}
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel="Volver a los grupos"
            >
              <Text style={styles.botonVolverTexto}>Volver a los grupos</Text>
            </TouchableOpacity>
          </>
        )}

        {ocupado && (
          <View style={styles.ocupado}>
            <ActivityIndicator color={DARK_BG} />
            <Text style={styles.ocupadoTexto}>Trabajando…</Text>
          </View>
        )}
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
  },
  botonApagado: { opacity: 0.5 },
  botonTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  nota: { fontSize: 12, color: '#888888', marginTop: 8, lineHeight: 18 },
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
  ficha: {
    borderWidth: 1,
    borderColor: '#E2E2E2',
    borderRadius: 10,
    padding: 14,
    marginTop: 18,
  },
  fichaTitulo: { fontSize: 13, fontWeight: 'bold', color: '#888888', textTransform: 'uppercase' },
  fichaValor: { fontSize: 15, color: '#111111', fontWeight: '600', marginTop: 6 },
  fichaNota: { fontSize: 12, color: '#888888', marginTop: 4 },
  botonSecundario: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: DARK_BG,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  botonSecundarioTexto: { color: DARK_BG, fontSize: 14, fontWeight: '600' },
  seccion: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#888888',
    textTransform: 'uppercase',
    marginTop: 24,
    marginBottom: 8,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  filaIzquierda: { flex: 1 },
  filaNombre: { fontSize: 15, color: '#111111', fontWeight: '600' },
  filaDetalle: { fontSize: 13, color: '#444444', marginTop: 2 },
  botonFila: { borderWidth: 1, borderColor: '#C2333F', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  botonFilaTexto: { color: '#C2333F', fontSize: 13, fontWeight: '600' },
  vacio: { fontSize: 14, color: '#888888' },
  ocupado: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 },
  ocupadoTexto: { fontSize: 14, color: '#444444' },
  botonVolver: { marginTop: 24, alignItems: 'center', paddingVertical: 12 },
  botonVolverTexto: { color: '#444444', fontSize: 15, fontWeight: '600' },
});
