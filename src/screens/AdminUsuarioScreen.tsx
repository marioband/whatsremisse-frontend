import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';

import { CabeceraDelPanel, PantallaSoloAdministradores, useEsAdministrador } from '../components/PanelDeAdministracion';
import { Alert } from '../lib/alert';
import {
  panelActivarMembresia,
  panelCambiarRol,
  panelQuitarMembresia,
  panelUsuarios,
} from '../lib/database';
import {
  colorDeEstado,
  confirmacionDeQuitar,
  confirmacionDeRol,
  etiquetaDeMembresia,
  fechaCorta,
  nombreDeRol,
  nombreDeUsuario,
  PLANES,
  problemaDelPanel,
  ROLES,
  telefonoBonito,
  textoDeEstado,
  UsuarioDelPanel,
} from '../lib/panel';
import { RootStackParamList } from '../navigation/RootNavigator';

type PanelNav = StackNavigationProp<RootStackParamList, 'AdministracionUsuario'>;
type PanelRuta = RouteProp<RootStackParamList, 'AdministracionUsuario'>;

const DARK_BG = '#2D2D2D';

/**
 * La ficha de una cuenta: sus datos y las tres cosas que se pueden hacer desde aquí
 * (activar/extender la membresía, quitarla y cambiar el rol).
 *
 * Después de cada cambio se vuelve a leer la fila de la base: la pantalla nunca inventa el
 * resultado, y si la escritura no llegó se ve el estado real.
 */
export function AdminUsuarioScreen() {
  const navigation = useNavigation<PanelNav>();
  const { params } = useRoute<PanelRuta>();
  const esAdministrador = useEsAdministrador();

  const [usuario, setUsuario] = useState<UsuarioDelPanel>(params.usuario);
  const [ocupado, setOcupado] = useState(false);
  const [problema, setProblema] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    const telefono = usuario.phone;
    if (!telefono) return;
    try {
      const lista = await panelUsuarios(telefono, 'TODAS', 10);
      const actualizado = lista.find((u) => u.id === usuario.id);
      if (actualizado) setUsuario(actualizado);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[panel] no se pudo releer la cuenta:', err);
      setProblema(problemaDelPanel(err));
    }
  }, [usuario.id, usuario.phone]);

  useEffect(() => {
    void recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!esAdministrador) return <PantallaSoloAdministradores />;

  /** Ejecuta un cambio del panel: avisa si falla y relee la cuenta para pintar el estado real. */
  const ejecutar = (nombre: string, hacerlo: () => Promise<unknown>) => {
    setOcupado(true);
    setProblema(null);
    hacerlo()
      .then(async () => {
        await recargar();
        Alert.alert(nombre, 'Listo.');
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn(`[panel] ${nombre}: falló`, err);
        Alert.alert('No se pudo hacer', problemaDelPanel(err));
      })
      .finally(() => setOcupado(false));
  };

  const activar = (dias: number, etiqueta: string) => {
    ejecutar(`${etiqueta} activado`, () => panelActivarMembresia(usuario.id, dias, false));
  };

  const activarSinVencimiento = () => {
    Alert.alert(
      'Premium sin vencimiento',
      'La cuenta queda premium para siempre, hasta que tú se lo quites. Úsalo con quien no va a pagar por transferencia.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, sin vencimiento',
          onPress: () => ejecutar('Sin vencimiento activado', () => panelActivarMembresia(usuario.id, 30, true)),
        },
      ]
    );
  };

  const quitar = () => {
    Alert.alert('Quitar membresía', confirmacionDeQuitar(nombreDeUsuario(usuario)), [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sí, quitar',
        style: 'destructive',
        onPress: () => ejecutar('Membresía quitada', () => panelQuitarMembresia(usuario.id)),
      },
    ]);
  };

  const cambiarRol = (rol: string) => {
    if (rol === usuario.role) return;
    Alert.alert('Cambiar rol', confirmacionDeRol(nombreDeUsuario(usuario), rol), [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sí, cambiar',
        onPress: () => ejecutar('Rol cambiado', () => panelCambiarRol(usuario.id, rol)),
      },
    ]);
  };

  const esPremium = String(usuario.tier || '').toUpperCase() === 'PREMIUM';

  return (
    <View style={styles.container}>
      <CabeceraDelPanel titulo="Cuenta" />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.ficha}>
          <Text style={styles.nombre}>{nombreDeUsuario(usuario)}</Text>
          <Text style={styles.telefono}>{telefonoBonito(usuario.phone) || 'Sin teléfono'}</Text>
          <View style={[styles.etiqueta, { backgroundColor: colorDeEstado(usuario.estado) }]}>
            <Text style={styles.etiquetaTexto}>{textoDeEstado(usuario.estado)}</Text>
          </View>
        </View>

        <View style={styles.datos}>
          <Dato etiqueta="Membresía" valor={etiquetaDeMembresia(usuario)} />
          <Dato etiqueta="Rol" valor={nombreDeRol(usuario.role)} />
          <Dato
            etiqueta="Vence"
            valor={
              usuario.subscription_expires_at
                ? fechaCorta(usuario.subscription_expires_at)
                : esPremium
                  ? 'Sin vencimiento'
                  : '—'
            }
          />
          <Dato etiqueta="Cuenta creada" valor={fechaCorta(usuario.created_at) || '—'} />
          <Dato etiqueta="Última vez que se movió" valor={fechaCorta(usuario.last_seen_at) || 'Sin datos'} />
          <Dato etiqueta="Servicios publicados" valor={String(usuario.servicios ?? 0)} />
          <Dato etiqueta="Postulaciones" valor={String(usuario.postulaciones ?? 0)} />
        </View>

        {!!problema && <Text style={styles.problema}>{problema}</Text>}

        <Text style={styles.seccion}>Activar o extender membresía</Text>
        <View style={styles.botonesFila}>
          {PLANES.map((plan) => (
            <TouchableOpacity
              key={plan.dias}
              style={[styles.boton, ocupado && styles.botonApagado]}
              onPress={() => activar(plan.dias, plan.etiqueta)}
              disabled={ocupado}
              accessibilityRole="button"
              accessibilityLabel={`Activar ${plan.etiqueta}`}
            >
              <Text style={styles.botonTexto}>{plan.etiqueta}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.nota}>
          Si todavía no venció, los días se suman a lo que le quedaba: nunca se le quitan días.
        </Text>

        <TouchableOpacity
          style={[styles.botonSecundario, ocupado && styles.botonApagado]}
          onPress={activarSinVencimiento}
          disabled={ocupado}
          accessibilityRole="button"
          accessibilityLabel="Activar sin vencimiento"
        >
          <Text style={styles.botonSecundarioTexto}>Sin vencimiento</Text>
        </TouchableOpacity>

        {esPremium && (
          <TouchableOpacity
            style={[styles.botonPeligro, ocupado && styles.botonApagado]}
            onPress={quitar}
            disabled={ocupado}
            accessibilityRole="button"
            accessibilityLabel="Quitar la membresía"
          >
            <Text style={styles.botonPeligroTexto}>Quitar la membresía</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.seccion}>Rol de la cuenta</Text>
        <View style={styles.botonesFila}>
          {ROLES.map((rol) => {
            const activo = String(usuario.role || '').toUpperCase() === rol.id;
            return (
              <TouchableOpacity
                key={rol.id}
                style={[styles.chip, activo && styles.chipActivo, ocupado && styles.botonApagado]}
                onPress={() => cambiarRol(rol.id)}
                disabled={ocupado}
                accessibilityRole="button"
                accessibilityLabel={`Rol ${rol.etiqueta}${activo ? ' (actual)' : ''}`}
              >
                <Text style={[styles.chipTexto, activo && styles.chipTextoActivo]}>{rol.etiqueta}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.nota}>
          Un administrador puede abrir este panel. No se puede quitar el rol al último que queda, para
          que el panel no se cierre para siempre.
        </Text>

        {ocupado && (
          <View style={styles.ocupado}>
            <ActivityIndicator color={DARK_BG} />
            <Text style={styles.ocupadoTexto}>Guardando…</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.botonVolver}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Volver al listado"
        >
          <Text style={styles.botonVolverTexto}>Volver al listado</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={styles.dato}>
      <Text style={styles.datoEtiqueta}>{etiqueta}</Text>
      <Text style={styles.datoValor}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 16, paddingBottom: 48 },
  ficha: { alignItems: 'center', paddingVertical: 12 },
  nombre: { fontSize: 19, fontWeight: 'bold', color: '#111111', textAlign: 'center' },
  telefono: { fontSize: 15, color: '#444444', marginTop: 4 },
  etiqueta: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginTop: 10 },
  etiquetaTexto: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  datos: { borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 10, overflow: 'hidden', marginTop: 12 },
  dato: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  datoEtiqueta: { fontSize: 13, color: '#888888' },
  datoValor: { fontSize: 14, color: '#111111', fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  problema: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#C2333F',
    borderRadius: 10,
    padding: 12,
    color: '#C2333F',
    fontSize: 14,
    backgroundColor: '#FFF5F5',
  },
  seccion: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#888888',
    textTransform: 'uppercase',
    marginTop: 24,
    marginBottom: 8,
  },
  botonesFila: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  boton: {
    flexGrow: 1,
    backgroundColor: DARK_BG,
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  botonTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  botonApagado: { opacity: 0.5 },
  nota: { fontSize: 12, color: '#888888', marginTop: 8, lineHeight: 18 },
  botonSecundario: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: DARK_BG,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  botonSecundarioTexto: { color: DARK_BG, fontSize: 15, fontWeight: '600' },
  botonPeligro: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#C2333F',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  botonPeligroTexto: { color: '#C2333F', fontSize: 15, fontWeight: '600' },
  chip: {
    borderWidth: 1,
    borderColor: '#E2E2E2',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#FFFFFF',
  },
  chipActivo: { backgroundColor: '#3F51B5', borderColor: '#3F51B5' },
  chipTexto: { fontSize: 13, color: '#444444' },
  chipTextoActivo: { color: '#FFFFFF', fontWeight: '600' },
  ocupado: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  ocupadoTexto: { fontSize: 14, color: '#444444' },
  botonVolver: { marginTop: 24, alignItems: 'center', paddingVertical: 12 },
  botonVolverTexto: { color: '#444444', fontSize: 15, fontWeight: '600' },
});
