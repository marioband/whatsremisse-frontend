import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Image } from 'react-native';

import { InterruptorDeslizante } from '../components/InterruptorDeslizante';
import { CabeceraDelPanel, PantallaSoloAdministradores, useEsAdministrador } from '../components/PanelDeAdministracion';
import { elegirFoto, fueCancelado, subirFoto } from '../lib/adjuntos';
import { Alert } from '../lib/alert';
import { useAuth } from '../context/AuthContext';
import {
  MarcaDelSeguimiento,
  panelActivarMembresia,
  panelCambiarRol,
  panelGuardarMarca,
  panelMarcaDeUsuario,
  panelQuitarMembresia,
  panelUsuarios,
} from '../lib/database';
import {
  colorDeEstado,
  confirmacionDeQuitar,
  confirmacionDeRol,
  contrasteSobreColor,
  etiquetaDeMembresia,
  fechaCorta,
  limpiarColorDeMarca,
  MARCA_COLOR_PRINCIPAL,
  MARCA_COLOR_SECUNDARIO,
  nombreDeRol,
  nombreDeUsuario,
  normalizarColorDeMarca,
  PLANES,
  problemaDelPanel,
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
 * (activar/extender la membresía, quitarla y dar o quitar el administrador).
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

  /**
   * La marca del seguimiento (0049/0052) y el formulario para personalizar el enlace del cliente.
   * Se siembra con lo que devuelve la base —al abrir y después de cada guardado—, nunca inventa
   * nada; la vista previa se arma con lo que hay en el formulario, así que se mueve al instante.
   */
  const { profile } = useAuth();
  const [marcaActiva, setMarcaActiva] = useState(false);
  const [nombreDeLaMarca, setNombreDeLaMarca] = useState('');
  const [colorPrincipal, setColorPrincipal] = useState('');
  const [colorSecundario, setColorSecundario] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  const sembrarCampos = useCallback((m: MarcaDelSeguimiento | null) => {
    setMarcaActiva(Boolean(m?.activo));
    setNombreDeLaMarca(m?.nombre || '');
    setColorPrincipal(m?.color_principal || '');
    setColorSecundario(m?.color_secundario || '');
    setLogoUrl(m?.logo_url || '');
  }, []);

  const cargarMarca = useCallback(async () => {
    try {
      const m = await panelMarcaDeUsuario(usuario.id);
      sembrarCampos(m);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[panel] no se pudo leer la marca del seguimiento:', err);
      setProblema(problemaDelPanel(err));
    }
  }, [usuario.id, sembrarCampos]);

  useEffect(() => {
    void cargarMarca();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const activarPromocional = () => {
    Alert.alert(
      'Membresía promocional',
      'La cuenta queda con acceso completo y sin fecha de corte, hasta que tú se lo quites. Úsalo para cortesías o promociones.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, marcar promocional',
          onPress: () =>
            ejecutar('Promocional asignada', () => panelActivarMembresia(usuario.id, 30, true)),
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

  const cambiarAdministrador = (hacerAdmin: boolean) => {
    if (hacerAdmin === esAdmin) return;
    Alert.alert(
      hacerAdmin ? 'Hacer administrador' : 'Quitar administrador',
      confirmacionDeRol(nombreDeUsuario(usuario), hacerAdmin),
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: hacerAdmin ? 'Sí, hacer administrador' : 'Sí, quitar',
          onPress: () =>
            ejecutar(hacerAdmin ? 'Ahora es administrador' : 'Ya no es administrador', () =>
              panelCambiarRol(usuario.id, hacerAdmin ? 'ADMIN' : 'USER')
            ),
        },
      ]
    );
  };

  const esPremium = String(usuario.tier || '').toUpperCase() === 'PREMIUM';
  /** El interruptor guarda en el acto (el usuario lo ve al toque, sin esperar al botón). */
  const cambiarSeguimiento = (encendido: boolean) => {
    setMarcaActiva(encendido);
    ejecutar(encendido ? 'Compartir viaje encendido' : 'Compartir viaje apagado', async () => {
      const quedado = await panelGuardarMarca(usuario.id, { activo: encendido });
      sembrarCampos(quedado);
    });
  };

  /** Sube el logo al almacén (el mismo camino que las fotos del chat) y lo deja listo para guardar. */
  const subirLogo = async () => {
    if (!profile?.id) return;
    setOcupado(true);
    try {
      const elegida = await elegirFoto();
      if (!elegida.ok) {
        if (!fueCancelado(elegida)) Alert.alert('No se pudo usar el logo', elegida.motivo);
        return;
      }
      const subida = await subirFoto(elegida.valor, profile.id);
      if (!subida.ok) {
        Alert.alert('No se pudo subir el logo', subida.motivo);
        return;
      }
      setLogoUrl(subida.valor);
    } finally {
      setOcupado(false);
    }
  };

  /** Guarda nombre, colores y logo; la base valida el formato y devuelve la fila como quedó. */
  const guardarPersonalizacion = () => {
    const principal = normalizarColorDeMarca(colorPrincipal);
    const secundario = normalizarColorDeMarca(colorSecundario);
    if (colorPrincipal.trim() && !principal) {
      Alert.alert('Revisa el color principal', 'Va en formato #RRGGBB, por ejemplo #0B5FFF.');
      return;
    }
    if (colorSecundario.trim() && !secundario) {
      Alert.alert('Revisa el color secundario', 'Va en formato #RRGGBB, por ejemplo #9AA0A6.');
      return;
    }
    ejecutar('Personalización guardada', async () => {
      const quedado = await panelGuardarMarca(usuario.id, {
        nombre: nombreDeLaMarca,
        colorPrincipal: principal || null,
        colorSecundario: secundario || null,
        logo: logoUrl,
      });
      sembrarCampos(quedado);
    });
  };

  const esAdmin = String(usuario.role || '').toUpperCase() === 'ADMIN';

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
                  ? 'Sin fecha de corte'
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
          onPress={activarPromocional}
          disabled={ocupado}
          accessibilityRole="button"
          accessibilityLabel="Marcar promocional"
        >
          <Text style={styles.botonSecundarioTexto}>Promocional</Text>
        </TouchableOpacity>
        <Text style={styles.nota}>
          Promocional deja la cuenta con acceso completo y sin fecha de corte (cortesías). Se quita a
          mano cuando quieras.
        </Text>

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

        <Text style={styles.seccion}>Administrador del panel</Text>
        <TouchableOpacity
          style={[styles.botonSecundario, ocupado && styles.botonApagado]}
          onPress={() => cambiarAdministrador(!esAdmin)}
          disabled={ocupado}
          accessibilityRole="button"
          accessibilityLabel={esAdmin ? 'Quitarle el administrador' : 'Hacer administrador'}
        >
          <Text style={styles.botonSecundarioTexto}>
            {esAdmin ? 'Quitarle el administrador' : 'Hacer administrador'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.nota}>
          Un administrador puede abrir este panel. No se puede quitar el rol al último que queda, para
          que el panel no se cierre para siempre.
        </Text>

        <Text style={styles.seccion}>Compartir viaje (seguimiento en vivo)</Text>
        <View style={styles.interruptorFila}>
          <InterruptorDeslizante
            encendido={marcaActiva}
            onCambiar={cambiarSeguimiento}
            etiqueta="Compartir viaje para esta cuenta"
          />
          <Text style={styles.interruptorTexto}>
            {marcaActiva
              ? 'Encendido: esta cuenta ve el botón «Compartir viaje» y puede generar el enlace del cliente.'
              : 'Apagado: esta cuenta no ve el botón «Compartir viaje».'}
          </Text>
        </View>

        <Text style={styles.campoEtiqueta}>Nombre en el enlace</Text>
        <TextInput
          style={styles.campo}
          value={nombreDeLaMarca}
          onChangeText={setNombreDeLaMarca}
          placeholder="Si se deja vacío, firma con su nombre de proveedor"
          placeholderTextColor="#999999"
          maxLength={40}
        />

        <View style={styles.coloresFila}>
          <View style={styles.colorColumna}>
            <Text style={styles.campoEtiqueta}>Color principal</Text>
            <View style={styles.colorEntrada}>
              <View
                style={[
                  styles.colorMuestra,
                  {
                    backgroundColor:
                      normalizarColorDeMarca(colorPrincipal) || MARCA_COLOR_PRINCIPAL,
                  },
                ]}
              />
              <TextInput
                style={styles.campoColor}
                value={colorPrincipal}
                onChangeText={(t) => setColorPrincipal(limpiarColorDeMarca(t))}
                placeholder={MARCA_COLOR_PRINCIPAL}
                placeholderTextColor="#999999"
                autoCapitalize="characters"
                maxLength={7}
              />
            </View>
          </View>
          <View style={styles.colorColumna}>
            <Text style={styles.campoEtiqueta}>Color secundario</Text>
            <View style={styles.colorEntrada}>
              <View
                style={[
                  styles.colorMuestra,
                  {
                    backgroundColor:
                      normalizarColorDeMarca(colorSecundario) || MARCA_COLOR_SECUNDARIO,
                  },
                ]}
              />
              <TextInput
                style={styles.campoColor}
                value={colorSecundario}
                onChangeText={(t) => setColorSecundario(limpiarColorDeMarca(t))}
                placeholder={MARCA_COLOR_SECUNDARIO}
                placeholderTextColor="#999999"
                autoCapitalize="characters"
                maxLength={7}
              />
            </View>
          </View>
        </View>

        <Text style={styles.campoEtiqueta}>Logo (PNG con fondo transparente)</Text>
        <View style={styles.logoFila}>
          {logoUrl ? <Image source={{ uri: logoUrl }} style={styles.logoMini} /> : null}
          <TouchableOpacity
            style={[styles.botonSecundario, styles.logoBoton, ocupado && styles.botonApagado]}
            onPress={subirLogo}
            disabled={ocupado}
            accessibilityRole="button"
            accessibilityLabel="Subir el logo del enlace"
          >
            <Text style={styles.botonSecundarioTexto}>{logoUrl ? 'Cambiar logo' : 'Subir logo'}</Text>
          </TouchableOpacity>
        </View>

        <VistaPreviaDelLink
          nombre={nombreDeLaMarca}
          colorPrincipal={colorPrincipal}
          colorSecundario={colorSecundario}
          logoUrl={logoUrl}
        />

        <TouchableOpacity
          style={[styles.boton, ocupado && styles.botonApagado]}
          onPress={guardarPersonalizacion}
          disabled={ocupado}
          accessibilityRole="button"
          accessibilityLabel="Guardar la personalización del enlace"
        >
          <Text style={styles.botonTexto}>Guardar personalización</Text>
        </TouchableOpacity>
        <Text style={styles.nota}>
          Los colores van en formato #RRGGBB (por ejemplo #0B5FFF). El enlace toma los cambios en
          segundos: la página se actualiza sola.
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

/**
 * La mini maqueta de la cabecera del enlace (pedido del usuario, 10-10-2026): se actualiza al
 * instante con lo que hay en el formulario —nombre, color principal, logo— más el trazo y el
 * punto del color secundario, para ver cómo le queda la personalización.
 */
export function VistaPreviaDelLink({
  nombre,
  colorPrincipal,
  colorSecundario,
  logoUrl,
}: {
  nombre: string;
  colorPrincipal: string;
  colorSecundario: string;
  logoUrl: string;
}) {
  const principal = normalizarColorDeMarca(colorPrincipal) || MARCA_COLOR_PRINCIPAL;
  const secundario = normalizarColorDeMarca(colorSecundario) || MARCA_COLOR_SECUNDARIO;
  return (
    <View style={styles.vistaPrevia}>
      <View style={[styles.vistaCabecera, { backgroundColor: principal }]}>
        {logoUrl ? <Image source={{ uri: logoUrl }} style={styles.vistaLogo} /> : null}
        <Text
          style={[styles.vistaNombre, { color: contrasteSobreColor(principal) }]}
          numberOfLines={1}
        >
          {nombre.trim() || 'Su nombre de proveedor'}
        </Text>
      </View>
      <View style={styles.vistaMapa}>
        <View style={[styles.vistaTrazo, { backgroundColor: principal }]} />
        <View style={[styles.vistaPunto, { backgroundColor: secundario }]} />
      </View>
      <Text style={styles.vistaNota}>Así se verá la cabecera del enlace del cliente.</Text>
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
  /** --- Compartir viaje: la selección y la personalización del enlace (10-10-2026) --- */
  interruptorFila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  interruptorTexto: { flex: 1, fontSize: 13, color: '#444444', lineHeight: 19 },
  campoEtiqueta: { fontSize: 13, color: '#888888', marginTop: 14, marginBottom: 6 },
  campo: {
    borderWidth: 1,
    borderColor: '#E2E2E2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111111',
    backgroundColor: '#FFFFFF',
  },
  coloresFila: { flexDirection: 'row', gap: 12 },
  colorColumna: { flex: 1 },
  colorEntrada: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E2E2E2',
    borderRadius: 10,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
  },
  colorMuestra: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
  },
  campoColor: { flex: 1, paddingVertical: 10, fontSize: 15, color: '#111111' },
  logoFila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoMini: { width: 42, height: 42, borderRadius: 10, backgroundColor: '#F2F2F2' },
  logoBoton: { flexGrow: 1, marginTop: 0 },
  /** La mini maqueta: la cabecera del enlace como la verá el cliente. */
  vistaPrevia: { marginTop: 16 },
  vistaCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  vistaLogo: { width: 22, height: 22, borderRadius: 4 },
  vistaNombre: { fontSize: 15, fontWeight: '700' },
  vistaMapa: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingHorizontal: 4 },
  vistaTrazo: { flex: 1, height: 4, borderRadius: 2 },
  vistaPunto: { width: 12, height: 12, borderRadius: 6 },
  vistaNota: { fontSize: 11, color: '#888888', marginTop: 6, textAlign: 'center' },
  ocupado: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  ocupadoTexto: { fontSize: 14, color: '#444444' },
  botonVolver: { marginTop: 24, alignItems: 'center', paddingVertical: 12 },
  botonVolverTexto: { color: '#444444', fontSize: 15, fontWeight: '600' },
});
