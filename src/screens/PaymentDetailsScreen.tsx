import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Platform,
} from 'react-native';

import { useMockStore } from '../context/MockStoreContext';
import { Alert } from '../lib/alert';
import { textoDeErrorParaElUsuario } from '../lib/errors';
import {
  BANCOS,
  BILLETERAS,
  Banco,
  Billetera,
  bancoAGuardar,
  chipDeBanco,
  chipDeBilletera,
  codigoDeBilletera,
  etiquetaDelNumeroDeBilletera,
} from '../lib/billeterasYBancos';
import { RootStackParamList } from '../navigation/RootNavigator';

type PaymentNav = StackNavigationProp<RootStackParamList, 'PaymentDetails'>;
type PaymentRoute = RouteProp<RootStackParamList, 'PaymentDetails'>;

const DARK_BG = '#2D2D2D';
const BLUE = '#3F51B5';

/**
 * Datos de pago: billetera y banco, con sus números.
 *
 * Pedido del usuario (20-09-2026): «el apartado no deja elegir el tipo de billetera ni el tipo de
 * banco». Billeteras: Yape, Plin, Bim, Otro. Bancos: BCP, Interbank, Scotiabank, Otro — y el banco
 * lleva SIEMPRE número de cuenta y CCI.
 *
 * Antes la pantalla tenía tres campos fijos («Número Yape», «Cuenta BCP», «CCI BCP»): no había
 * forma de decir que la billetera era Plin o que la cuenta era de Interbank, y quien recibía el
 * dinero veía el rótulo equivocado. Ahora se elige con botones y las etiquetas se arman con lo
 * elegido; «Otro» pide el nombre para poder enseñarlo.
 *
 * Nada de esto bloquea el guardado: sin elegir nada se guarda igual (y los rótulos del chat caen al
 * texto genérico de siempre). Los números siguen en las mismas columnas de la base.
 */
export function PaymentDetailsScreen() {
  const navigation = useNavigation<PaymentNav>();
  const route = useRoute<PaymentRoute>();
  const { userProfile, persistUserProfile } = useMockStore();
  const fromOnboarding = route.params?.fromOnboarding ?? false;

  const [billetera, setBilletera] = useState<Billetera>('Yape');
  const [billeteraOtro, setBilleteraOtro] = useState('');
  const [numeroDeBilletera, setNumeroDeBilletera] = useState('');
  const [banco, setBanco] = useState<Banco>('BCP');
  const [bancoOtro, setBancoOtro] = useState('');
  const [cuenta, setCuenta] = useState('');
  const [cci, setCci] = useState('');
  const [saving, setSaving] = useState(false);
  const [hydratedFields, setHydratedFields] = useState(false);

  // Los datos de pago llegan desde Supabase después del primer render.
  useEffect(() => {
    if (!userProfile || hydratedFields) return;
    // Con lo guardado se marca el botón que toca; si no hay tipo (perfiles de antes de la 0039),
    // se arranca en Yape/BCP, que es como se leían siempre esos dos campos.
    setBilletera(chipDeBilletera(userProfile.billeteraTipo, userProfile.billeteraNombre) ?? 'Yape');
    setBilleteraOtro(
      chipDeBilletera(userProfile.billeteraTipo, userProfile.billeteraNombre) === 'Otro'
        ? userProfile.billeteraNombre || ''
        : ''
    );
    setNumeroDeBilletera(userProfile.yapeNumber || '');
    setBanco(chipDeBanco(userProfile.bancoNombre) ?? 'BCP');
    setBancoOtro(
      chipDeBanco(userProfile.bancoNombre) === 'Otro' ? userProfile.bancoNombre || '' : ''
    );
    setCuenta(userProfile.bcpAccount || '');
    setCci(userProfile.bcpCci || '');
    setHydratedFields(true);
  }, [userProfile, hydratedFields]);

  const handleSave = async () => {
    if (!userProfile) {
      Alert.alert(
        'Perfil incompleto',
        'Completa primero tus datos de perfil antes de guardar los datos de pago.'
      );
      return;
    }

    setSaving(true);
    try {
      // Persiste en Supabase (profiles.bcp_*/yape_number + 0039 para el tipo de billetera y banco);
      // antes solo quedaba en memoria.
      await persistUserProfile({
        ...userProfile,
        yapeNumber: numeroDeBilletera,
        bcpAccount: cuenta,
        bcpCci: cci,
        billeteraTipo: codigoDeBilletera(billetera) || undefined,
        billeteraNombre: billetera === 'Otro' ? billeteraOtro.trim() : undefined,
        bancoNombre: bancoAGuardar(banco, bancoOtro) || undefined,
      });
      Alert.alert('Guardado', 'Tus datos de pago han sido actualizados.');
      if (fromOnboarding) {
        navigation.replace('Main');
      } else {
        navigation.goBack();
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[PaymentDetails] Error guardando datos de pago:', err);
      Alert.alert('No se pudieron guardar los datos de pago', textoDeErrorParaElUsuario(err));
    } finally {
      setSaving(false);
    }
  };

  /**
   * La flecha de atrás.
   *
   * En el PRIMER REGISTRO esta pantalla sustituyó a «datos personales» (`ProfileSetupScreen` hace
   * `replace`), así que no hay nada detrás y la flecha no hacía nada: el usuario lo reportó el
   * 20-09-2026 («hay una flecha que se entiende que es para regresar a la pantalla de datos
   * personales, pero no tiene función»). Aquí vuelve a datos personales.
   *
   * Ya dentro de la app (Cuenta → Datos de pago) sí hay historial: vuelve a Cuenta, como siempre.
   */
  const volver = () => {
    if (fromOnboarding) {
      navigation.replace('ProfileSetup');
      return;
    }
    navigation.goBack();
  };

  /** Fila de botones (mismo dibujo que el «Tipo de pago» de Nuevo servicio). */
  const botones = <Opcion extends string>(
    opciones: readonly Opcion[],
    elegida: Opcion,
    alElegir: (opcion: Opcion) => void
  ) => (
    <View style={styles.optionsRow}>
      {opciones.map((opcion) => (
        <TouchableOpacity
          key={opcion}
          style={[styles.optionChip, elegida === opcion && styles.optionChipActive]}
          onPress={() => alElegir(opcion)}
          accessibilityRole="button"
          accessibilityState={{ selected: elegida === opcion }}
        >
          <Text style={[styles.optionChipText, elegida === opcion && styles.optionChipTextActive]}>
            {opcion}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={volver} accessibilityLabel="Volver">
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Datos de pago</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <Text style={styles.sectionTitle}>Métodos de pago P2P</Text>
        <Text style={styles.sectionSubtitle}>
          Estos datos se compartirán con quien tenga que pagarte para realizar la transferencia.
        </Text>

        {/* ---------------------------------------------------------------- billetera */}
        <Text style={styles.groupTitle}>Billetera</Text>
        {botones(BILLETERAS, billetera, setBilletera)}
        {billetera === 'Otro' && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>¿Cuál es la billetera?</Text>
            <TextInput
              style={styles.input}
              placeholder="Nombre de la billetera"
              placeholderTextColor="#999"
              value={billeteraOtro}
              onChangeText={setBilleteraOtro}
            />
          </View>
        )}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{etiquetaDelNumeroDeBilletera(billetera, billeteraOtro)}</Text>
          <TextInput
            style={styles.input}
            placeholder="Número"
            placeholderTextColor="#999"
            value={numeroDeBilletera}
            onChangeText={setNumeroDeBilletera}
            keyboardType="phone-pad"
          />
        </View>

        {/* ---------------------------------------------------------------- banco */}
        <Text style={styles.groupTitle}>Banco</Text>
        {botones(BANCOS, banco, setBanco)}
        {banco === 'Otro' && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>¿Cuál es el banco?</Text>
            <TextInput
              style={styles.input}
              placeholder="Nombre del banco"
              placeholderTextColor="#999"
              value={bancoOtro}
              onChangeText={setBancoOtro}
            />
          </View>
        )}
        {/* Un banco tiene DOS números: el de la cuenta y el CCI (para transferencias). */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Número de cuenta</Text>
          <TextInput
            style={styles.input}
            placeholder="Número de cuenta"
            placeholderTextColor="#999"
            value={cuenta}
            onChangeText={setCuenta}
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>CCI</Text>
          <TextInput
            style={styles.input}
            placeholder="CCI"
            placeholderTextColor="#999"
            value={cci}
            onChangeText={setCci}
          />
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>{saving ? 'Guardando...' : 'Guardar'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: DARK_BG,
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
  body: { flex: 1, backgroundColor: '#fff' },
  bodyContent: { padding: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#111', marginBottom: 6 },
  sectionSubtitle: { fontSize: 13, color: '#888', marginBottom: 24, lineHeight: 18 },
  groupTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 12,
    marginTop: 4,
  },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  optionChip: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  optionChipActive: {
    backgroundColor: BLUE,
    borderColor: BLUE,
  },
  optionChipText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '600',
  },
  optionChipTextActive: {
    color: '#fff',
  },
  inputGroup: { marginBottom: 18 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  input: {
    backgroundColor: '#F2F2F2',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111',
    // En web el navegador dibuja su recuadro de foco (outline) al tocar el campo: la app no lo
    // quiere (misma regla que en Busqueda y ChatInputBar). En nativo no existe.
    ...Platform.select({ web: { outlineStyle: 'none' } as object }),
  },
  saveButton: {
    backgroundColor: BLUE,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
