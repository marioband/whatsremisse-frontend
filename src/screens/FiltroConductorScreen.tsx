import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  SafeAreaView,
} from 'react-native';

import { useAuth } from '../context/AuthContext';
import { useMockStore } from '../context/MockStoreContext';
import { RADIO_DE_EMERGENCIAS_KM } from '../lib/emergencias';
import { ultimaUbicacion } from '../lib/geolocation';
import { useUnidadesExtra } from '../hooks/useUnidadesExtra';
import { AZUL, TEXTO_SUAVE } from '../lib/colors';
import { esPremium } from '../lib/premium';
import {
  ESCALA_DE_UNIDADES,
  esUnidadMayorQueLaSuya,
  tiposEfectivos,
  unidadMayor,
  unidadesQuePuedeRecibir,
} from '../lib/unidades';
import { RootStackParamList } from '../navigation/RootNavigator';
import { IconoDeAtras } from '../components/IconoDeAtras';

type FiltroNav = StackNavigationProp<RootStackParamList, 'FiltroConductor'>;
const DARK_BG = '#2D2D2D';

/**
 * «Filtro conductor» (pedido del usuario, 21-09-2026): el botón ▼ que está al lado de la lupa en el
 * inicio del conductor.
 *
 *   «De acuerdo a la unidad que tiene, el usuario puede optar por elegir recibir alertas de
 *    unidades de menor dimensión, con botoneras idénticas a las de Mi perfil / tipo de unidad; las
 *    unidades más grandes van sombreadas, como señal de que no pueden ser seleccionadas.»
 *
 * Las botoneras son las mismas de siempre (`Auto compacto`, `Auto`, `Camioneta`, `Camioneta 3
 * filas`, `Minivan`, `Minibús`, `Bus`). Su unidad (y las menores) se pueden marcar; las MÁS GRANDES
 * que la suya salen sombreadas y no responden al toque: no puede llevar algo más grande que su
 * vehículo, así que no tiene sentido ofrecérselo.
 *
 * Y «Recibir alertas de grupos externos (Premium)», que el usuario definió el 21-09-2026: entran
 * SOLO los servicios que el proveedor marque como EMERGENCIA en Nuevo servicio, SOLO si están a
 * menos de 15 km del punto de recogida (con su ubicación) y, si lo activa, además le suena el
 * teléfono. La marca vive en su perfil (`profiles.recibir_emergencias`, migración 0042) porque el
 * aviso lo manda el servidor; la regla del «cerca» es `lib/emergencias.ts`.
 */
export function FiltroConductorScreen() {
  const navigation = useNavigation<FiltroNav>();
  const { userProfile, persistUserProfile, refrescar } = useMockStore();
  // La membresía vive en el perfil de la cuenta (`profiles.tier`), no en el perfil de las pantallas.
  const { profile, refrescarPerfil } = useAuth();
  const [extra, guardarExtra] = useUnidadesExtra();
  const [guardandoEmergencias, setGuardandoEmergencias] = useState(false);

  /** 0042: la marca vive en el perfil (la lee el servidor para el aviso al teléfono). */
  const emergenciasActivas = userProfile?.recibirEmergencias === true;
  const premium = esPremium(profile);
  const tengoUbicacion = ultimaUbicacion() !== null;

  /**
   * Activar/desactivar las emergencias cercanas.
   *
   * Se guarda en el perfil (no solo en el teléfono: el aviso lo manda el servidor), se relee el
   * perfil para que el resto de la app lo vea, y se recarga la lista para que las emergencias
   * aparezcan (o desaparezcan) en el acto.
   */
  const alternarEmergencias = async () => {
    if (!userProfile || guardandoEmergencias || !premium) return;
    setGuardandoEmergencias(true);
    try {
      await persistUserProfile({ ...userProfile, recibirEmergencias: !emergenciasActivas });
      await refrescarPerfil();
      refrescar();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[FiltroConductor] no se pudo guardar la preferencia:', err);
      Alert.alert('No se pudo cambiar', 'Vuelve a intentarlo en un momento.');
    } finally {
      setGuardandoEmergencias(false);
    }
  };

  const misUnidades = userProfile?.vehicleTypes ?? [];
  const techo = unidadMayor(misUnidades);
  const puedeRecibir = useMemo(() => unidadesQuePuedeRecibir(misUnidades), [misUnidades]);
  const conLasQueCuenta = useMemo(() => tiposEfectivos(misUnidades, extra), [misUnidades, extra]);

  const alternar = (unidad: string) => {
    const marcada = extra.includes(unidad);
    void guardarExtra(marcada ? extra.filter((u) => u !== unidad) : [...extra, unidad]);
  };

  const esMia = (unidad: string) => misUnidades.includes(unidad);

  const fila = (unidad: string) => {
    const mia = esMia(unidad);
    const sombreada = esUnidadMayorQueLaSuya(unidad, misUnidades);
    const marcada = mia || extra.includes(unidad);
    return (
      <TouchableOpacity
        key={unidad}
        style={[styles.boton, marcada && styles.botonMarcado, sombreada && styles.botonSombreado]}
        onPress={() => (mia || sombreada ? undefined : alternar(unidad))}
        disabled={mia || sombreada}
        accessibilityRole="button"
        accessibilityState={{ selected: marcada, disabled: mia || sombreada }}
        accessibilityLabel={
          mia
            ? `${unidad} (tu unidad)`
            : sombreada
              ? `${unidad}: no disponible, es más grande que tu vehículo`
              : unidad
        }
      >
        <Text
          style={[
            styles.botonTexto,
            marcada && styles.botonTextoMarcado,
            sombreada && styles.botonTextoSombreado,
          ]}
        >
          {unidad}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Volver">
          <IconoDeAtras />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Filtro conductor</Text>
        {/* El hueco del otro lado, para que el título quede centrado. */}
        <View style={styles.headerHueco} />
      </View>

      <ScrollView contentContainerStyle={styles.cuerpo}>
        <Text style={styles.titulo}>Recibir también alertas de unidades</Text>
        <Text style={styles.explicacion}>
          {techo
            ? `Tu unidad es ${techo}. Puedes marcar también las más pequeñas para que te lleguen sus alertas; ` +
              'las más grandes que la tuya no se pueden marcar.'
            : 'Todavía no has declarado tu unidad en Mi perfil: cuando lo hagas, aquí podrás elegir qué unidades más pequeñas quieres recibir.'}
        </Text>

        <View style={styles.rejilla}>{ESCALA_DE_UNIDADES.map(fila)}</View>

        {puedeRecibir.length <= 1 && (
          <Text style={styles.nota}>
            Con un {techo || 'vehículo'} no hay unidades más pequeñas que puedas recibir.
          </Text>
        )}

        <Text style={styles.resumen}>
          Ahora mismo te llegan las alertas de:{' '}
          {conLasQueCuenta.length > 0 ? conLasQueCuenta.join(', ') : 'ninguna unidad declarada'}.
        </Text>
        {/* ------------------------------------------------ grupos externos (Premium) */}
        <Text style={styles.titulo}>Recibir alertas de grupos externos (Premium)</Text>
        <Text style={styles.explicacion}>
          Los proveedores pueden marcar un servicio como{' '}
          <Text style={styles.negrita}>emergencia</Text>. Si lo activas, verás las emergencias que
          se publiquen a menos de {RADIO_DE_EMERGENCIAS_KM} km del punto de recogida aunque no sean
          de tus grupos, y además te sonará el teléfono.
        </Text>

        <TouchableOpacity
          style={[
            styles.interruptor,
            emergenciasActivas && styles.interruptorActivo,
            !premium && styles.botonSombreado,
          ]}
          onPress={alternarEmergencias}
          disabled={!premium || guardandoEmergencias}
          accessibilityRole="button"
          accessibilityState={{ selected: emergenciasActivas, disabled: !premium }}
          accessibilityLabel={
            emergenciasActivas ? 'Emergencias activadas' : 'Emergencias desactivadas'
          }
        >
          <Text style={[styles.interruptorTexto, emergenciasActivas && styles.botonTextoMarcado]}>
            {guardandoEmergencias
              ? 'Guardando…'
              : emergenciasActivas
                ? 'Activado: quiero recibir emergencias cercanas'
                : 'Desactivado: solo mis grupos'}
          </Text>
        </TouchableOpacity>

        {!premium && (
          <Text style={styles.nota}>Las alertas de grupos externos son una función Premium.</Text>
        )}
        {premium && emergenciasActivas && !tengoUbicacion && (
          <Text style={styles.nota}>
            Para saber qué emergencias están cerca necesitamos tu ubicación, y ahora mismo no la
            tenemos: actívala en el teléfono para que puedan llegarte.
          </Text>
        )}
        {premium && !emergenciasActivas && (
          <Text style={styles.premiumNota}>Tu membresía ya permite activarlo cuando quieras.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DARK_BG,
    paddingTop: 50,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  headerArrow: { color: '#fff', fontSize: 24 },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  headerHueco: { width: 24 },
  cuerpo: { padding: 20, paddingBottom: 40 },
  titulo: { fontSize: 18, fontWeight: 'bold', color: '#111', marginBottom: 8 },
  explicacion: { fontSize: 13, color: TEXTO_SUAVE, lineHeight: 19, marginBottom: 18 },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap' },
  boton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#DDDDDD',
  },
  botonMarcado: {
    backgroundColor: AZUL,
    borderColor: AZUL,
  },
  botonSombreado: {
    // Las más grandes que su vehículo: sombreadas y sin poder marcarse (lo pidió así).
    backgroundColor: '#F2F2F2',
    borderColor: '#E4E4E4',
    opacity: 0.55,
  },
  botonTexto: { fontSize: 13, color: '#555555', fontWeight: '600' },
  botonTextoMarcado: { color: '#FFFFFF' },
  botonTextoSombreado: { color: '#A5A5A5' },
  nota: { fontSize: 12, color: TEXTO_SUAVE, marginTop: 6, lineHeight: 17 },
  resumen: { fontSize: 13, color: '#333333', marginTop: 20, lineHeight: 19 },
  negrita: { fontWeight: '700', color: '#111' },
  interruptor: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#D5D9E0',
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  interruptorActivo: { borderColor: AZUL, backgroundColor: '#EEF3FF' },
  interruptorTexto: { fontSize: 15, fontWeight: '600', color: '#333', textAlign: 'center' },
  premiumNota: { fontSize: 12, color: TEXTO_SUAVE, marginTop: 14, lineHeight: 17 },
});
