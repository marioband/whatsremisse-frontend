import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';

import { useAuth } from '../context/AuthContext';
import { useMockStore, UserProfile } from '../context/MockStoreContext';
import { elegirFoto, fueCancelado, subirFoto, tomarFoto } from '../lib/adjuntos';
import { Alert } from '../lib/alert';
import { textoDeErrorParaElUsuario } from '../lib/errors';
import { alternarUnidad, UNIDADES, UNIDADES_GRANDES, UNIDAD_POR_DEFECTO } from '../lib/unidades';
import { RootStackParamList } from '../navigation/RootNavigator';

type SetupNav = StackNavigationProp<RootStackParamList, 'ProfileSetup'>;

const DARK_BG = '#2D2D2D';

export function ProfileSetupScreen() {
  const navigation = useNavigation<SetupNav>();
  const { session, phone, completeProfileSetup, requiresProfileSetup } = useAuth();
  const { role, userProfile, persistUserProfile } = useMockStore();

  const [firstName, setFirstName] = useState(userProfile?.firstName || '');
  const [lastName, setLastName] = useState(userProfile?.lastName || '');
  const [dni, setDni] = useState(userProfile?.dni || '');
  const [vehicleTypes, setVehicleTypes] = useState<string[]>(
    () => userProfile?.vehicleTypes ?? [UNIDAD_POR_DEFECTO]
  );
  const [brand, setBrand] = useState(userProfile?.brand || '');
  const [model, setModel] = useState(userProfile?.model || '');
  const [year, setYear] = useState(userProfile?.year || '');
  const [color, setColor] = useState(userProfile?.color || '');
  const [plate, setPlate] = useState(userProfile?.plate || '');
  const [providerName, setProviderName] = useState(userProfile?.providerName || '');
  const [driverPhotoUrl, setDriverPhotoUrl] = useState(userProfile?.driverPhotoUrl || '');
  /** ¿Qué foto se está subiendo ahora? (para avisar y no dejar pulsar dos veces) */
  const [subiendoFoto, setSubiendoFoto] = useState<'perfil' | 'proveedor' | null>(null);
  const [providerPhotoUrl, setProviderPhotoUrl] = useState(userProfile?.providerPhotoUrl || '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hydratedFields, setHydratedFields] = useState(false);

  // El perfil llega desde Supabase después del primer render: rellena los campos
  // en cuanto esté disponible, salvo que el usuario ya haya escrito algo.
  useEffect(() => {
    if (!userProfile || hydratedFields) return;
    setFirstName(userProfile.firstName);
    setLastName(userProfile.lastName);
    setDni(userProfile.dni);
    setVehicleTypes(userProfile.vehicleTypes ?? [UNIDAD_POR_DEFECTO]);
    setBrand(userProfile.brand);
    setModel(userProfile.model);
    setYear(userProfile.year);
    setColor(userProfile.color);
    setPlate(userProfile.plate);
    setProviderName(userProfile.providerName);
    setDriverPhotoUrl(userProfile.driverPhotoUrl || '');
    setProviderPhotoUrl(userProfile.providerPhotoUrl || '');
    setHydratedFields(true);
  }, [userProfile, hydratedFields]);

  /**
   * Sube una foto de verdad (pedido del usuario, 19-09-2026: «el botón para subir foto de
   * perfil / de empresa no funciona adecuadamente»).
   *
   * Antes estos botones no subían nada: abrían un aviso que solo ofrecía un avatar generado,
   * así que no había forma de poner una foto propia. Ahora se elige de la galería o se toma con
   * la cámara (`lib/adjuntos`, el mismo camino que las fotos del chat: se recorta a 1600 px y
   * se sube al almacén) y la URL pública se guarda en el perfil, donde ya se leía.
   */
  const pedirYSubirFoto = async (cual: 'perfil' | 'proveedor', origen: 'camara' | 'galeria') => {
    const elegida = origen === 'camara' ? await tomarFoto() : await elegirFoto();
    if (!elegida.ok) {
      // Cancelar no es un fallo: no se avisa de nada.
      if (!fueCancelado(elegida)) Alert.alert('No se pudo usar la foto', elegida.motivo);
      return;
    }
    const userId = session?.user?.id || '';
    if (!userId) {
      Alert.alert('No se pudo subir la foto', 'Vuelve a entrar a tu cuenta e inténtalo de nuevo.');
      return;
    }
    setSubiendoFoto(cual);
    const subida = await subirFoto(elegida.valor, userId);
    setSubiendoFoto(null);
    if (!subida.ok) {
      Alert.alert('No se pudo subir la foto', subida.motivo);
      return;
    }
    if (cual === 'perfil') setDriverPhotoUrl(subida.valor);
    else setProviderPhotoUrl(subida.valor);
  };

  const handlePickDriverPhoto = () => {
    Alert.alert('Foto de perfil', '¿De dónde sacamos la foto?', [
      { text: 'Tomar foto', onPress: () => pedirYSubirFoto('perfil', 'camara') },
      { text: 'Elegir de la galería', onPress: () => pedirYSubirFoto('perfil', 'galeria') },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const handlePickProviderPhoto = () => {
    Alert.alert('Foto de empresa', '¿De dónde sacamos la foto?', [
      { text: 'Tomar foto', onPress: () => pedirYSubirFoto('proveedor', 'camara') },
      { text: 'Elegir de la galería', onPress: () => pedirYSubirFoto('proveedor', 'galeria') },
      {
        text: 'Usar mi foto de perfil',
        onPress: () => setProviderPhotoUrl(driverPhotoUrl || ''),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const handleSave = async () => {
    setSaveError(null);

    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !dni.trim() ||
      !brand.trim() ||
      !model.trim() ||
      !plate.trim()
    ) {
      setSaveError(
        'Completa los campos obligatorios: nombres, apellidos, DNI, marca, modelo y placa.'
      );
      return;
    }

    setSaving(true);
    try {
      const nextProfile: UserProfile = {
        firstName,
        lastName,
        dni,
        phone: phone || userProfile?.phone || '',
        vehicleTypes,
        brand,
        model,
        year,
        color,
        plate,
        providerName,
        driverPhotoUrl,
        providerPhotoUrl,
        yapeNumber: userProfile?.yapeNumber,
        bcpAccount: userProfile?.bcpAccount,
        bcpCci: userProfile?.bcpCci,
      };

      if (requiresProfileSetup) {
        // Primer guardado (onboarding): asegura que exista la fila en `profiles`
        // con rol, teléfono y nombre antes de persistir el resto de los datos.
        await completeProfileSetup({
          full_name: `${firstName} ${lastName}`.trim() || null,
          role,
          vehicle_data: { vehicle_type: vehicleTypes, brand, model, plate },
        });
      }

      // Persiste TODO el perfil en Supabase (antes solo vivía en memoria y se
      // perdía al recargar la app).
      await persistUserProfile(nextProfile);

      if (requiresProfileSetup) {
        navigation.replace('PaymentDetails', { fromOnboarding: true });
      } else {
        navigation.goBack();
      }
    } catch (err) {
      const message = textoDeErrorParaElUsuario(err);
      // eslint-disable-next-line no-console
      console.error('[ProfileSetup] Error guardando:', err);
      setSaveError(message);
      Alert.alert('Error al guardar', message);
    } finally {
      setSaving(false);
    }
  };

  const renderRow = (
    label: string,
    value: string,
    onChange: (text: string) => void,
    editable = true,
    keyboardType: 'default' | 'numeric' = 'default'
  ) => (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      {editable ? (
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          keyboardType={keyboardType}
          placeholder="-"
          placeholderTextColor="#999"
        />
      ) : (
        <Text style={[styles.input, styles.inputDisabled]} numberOfLines={1}>
          {value || '-'}
        </Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Mi perfil</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {/* Avatar */}
          <TouchableOpacity style={styles.avatarContainer} onPress={handlePickDriverPhoto}>
            {driverPhotoUrl ? (
              <Image source={{ uri: driverPhotoUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarIcon}>📷</Text>
              </View>
            )}
            <Text style={styles.changePhotoText}>
              {subiendoFoto === 'perfil' ? 'Subiendo foto…' : 'Cambiar foto de perfil'}
            </Text>
          </TouchableOpacity>

          {/* Driver data */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Datos del conductor</Text>
            {renderRow('Nombres', firstName, setFirstName)}
            {renderRow('Apellidos', lastName, setLastName)}
            {renderRow('DNI', dni, setDni, true, 'numeric')}
            {renderRow('Número Celular', phone || '', () => {}, false)}
          </View>

          {/* Vehicle data */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Datos del Vehículo</Text>

            <View style={styles.row}>
              <Text style={styles.label}>Tipo de unidad</Text>
              {/*
                El conductor también marca VARIAS unidades (regla del usuario, 19-09-2026):
                le llegan los servicios que pidan cualquiera de las que tenga. Las grandes
                van aparte, como en «Nuevo servicio». `alternarUnidad` nunca deja la lista
                vacía (sin ninguna unidad no le llegaría ningún servicio).
              */}
              <View style={styles.unitsColumn}>
                {[
                  { titulo: '', lista: UNIDADES },
                  { titulo: 'Unidades grandes', lista: UNIDADES_GRANDES },
                ].map((grupo) => (
                  <View key={grupo.titulo || 'unidades'}>
                    {grupo.titulo ? (
                      <Text style={styles.unitGroupTitle}>{grupo.titulo}</Text>
                    ) : null}
                    <View style={styles.vehicleTypeRow}>
                      {grupo.lista.map((type) => {
                        const marcada = vehicleTypes.includes(type);
                        return (
                          <TouchableOpacity
                            key={type}
                            style={[
                              styles.vehicleTypeChip,
                              marcada && styles.vehicleTypeChipActive,
                            ]}
                            onPress={() =>
                              setVehicleTypes((actual) => alternarUnidad(actual, type))
                            }
                            accessibilityRole="button"
                            accessibilityState={{ selected: marcada }}
                            accessibilityLabel={`Unidad ${type}`}
                          >
                            <Text
                              style={[
                                styles.vehicleTypeText,
                                marcada && styles.vehicleTypeTextActive,
                              ]}
                            >
                              {type}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {renderRow('Marca', brand, setBrand)}
            {renderRow('Modelo', model, setModel)}
            {renderRow('Año', year, setYear, true, 'numeric')}
            {renderRow('Color', color, setColor)}
            {renderRow('Placa', plate, setPlate)}
          </View>

          {/* Provider name */}
          <View style={styles.section}>
            {renderRow('Nombre de proveedor', providerName, setProviderName)}

            <Text style={[styles.label, { width: '100%', marginBottom: 10 }]}>
              Foto del proveedor
            </Text>
            <TouchableOpacity
              style={styles.providerPhotoContainer}
              onPress={handlePickProviderPhoto}
            >
              {providerPhotoUrl || driverPhotoUrl ? (
                <Image
                  source={{
                    uri: providerPhotoUrl || driverPhotoUrl,
                  }}
                  style={styles.providerPhoto}
                />
              ) : (
                <View style={styles.providerPhotoPlaceholder}>
                  <Text style={styles.avatarIcon}>🏢</Text>
                </View>
              )}
              <Text style={styles.changePhotoText}>
                {subiendoFoto === 'proveedor'
                  ? 'Subiendo foto…'
                  : providerPhotoUrl
                    ? 'Cambiar foto'
                    : 'Subir foto de proveedor'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.spacer} />
        </ScrollView>

        {/* Save button */}
        <View style={styles.footer}>
          {saveError && <Text style={styles.saveErrorText}>{saveError}</Text>}
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveText}>{saving ? 'Guardando...' : 'Guardar'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DARK_BG,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backBtn: {
    padding: 4,
  },
  backArrow: {
    color: '#fff',
    fontSize: 24,
  },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 28,
  },
  body: {
    padding: 20,
    paddingBottom: 40,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatar: {
    width: 140,
    height: 140,
    borderRadius: 20,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarIcon: {
    fontSize: 48,
  },
  changePhotoText: {
    fontSize: 14,
    color: '#333',
  },
  providerPhotoContainer: {
    alignItems: 'center',
    marginTop: 6,
  },
  providerPhoto: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 10,
  },
  providerPhotoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  label: {
    fontSize: 14,
    color: '#555',
    fontWeight: '500',
    width: '30%',
  },
  input: {
    width: '65%',
    backgroundColor: '#F2F2F2',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
  },
  inputDisabled: {
    color: '#888',
  },
  vehicleTypeRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  unitsColumn: {
    width: '65%',
  },
  unitGroupTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
    marginBottom: 6,
  },
  vehicleTypeChip: {
    backgroundColor: '#F2F2F2',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
    marginBottom: 6,
  },
  vehicleTypeChipActive: {
    backgroundColor: DARK_BG,
  },
  vehicleTypeText: {
    fontSize: 12,
    color: '#555',
  },
  vehicleTypeTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  spacer: {
    height: 20,
  },
  footer: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderTopWidth: 0.5,
    borderTopColor: '#ddd',
  },
  saveBtn: {
    backgroundColor: DARK_BG,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveErrorText: {
    color: '#FF6B6B',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  saveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
