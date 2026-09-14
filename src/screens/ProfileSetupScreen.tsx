import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useState } from 'react';
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
  Alert,
  Image,
} from 'react-native';

import { useAuth } from '../context/AuthContext';
import { useMockStore } from '../context/MockStoreContext';
import { RootStackParamList } from '../navigation/RootNavigator';

type SetupNav = StackNavigationProp<RootStackParamList, 'ProfileSetup'>;

const DARK_BG = '#2D2D2D';
const VEHICLE_TYPES = ['Auto compacto', 'Auto', 'Camioneta', 'Camioneta 3 filas'];

export function ProfileSetupScreen() {
  const navigation = useNavigation<SetupNav>();
  const { phone, completeProfileSetup, requiresProfileSetup } = useAuth();
  const { role, userProfile, setUserProfile } = useMockStore();

  const [firstName, setFirstName] = useState(userProfile?.firstName || '');
  const [lastName, setLastName] = useState(userProfile?.lastName || '');
  const [dni, setDni] = useState(userProfile?.dni || '');
  const [vehicleType, setVehicleType] = useState(userProfile?.vehicleType || 'Auto');
  const [brand, setBrand] = useState(userProfile?.brand || '');
  const [model, setModel] = useState(userProfile?.model || '');
  const [year, setYear] = useState(userProfile?.year || '');
  const [color, setColor] = useState(userProfile?.color || '');
  const [plate, setPlate] = useState(userProfile?.plate || '');
  const [providerName, setProviderName] = useState(userProfile?.providerName || '');
  const [driverPhotoUrl, setDriverPhotoUrl] = useState(userProfile?.driverPhotoUrl || '');
  const [providerPhotoUrl, setProviderPhotoUrl] = useState(userProfile?.providerPhotoUrl || '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handlePickDriverPhoto = () => {
    Alert.alert('Foto de perfil', 'Selecciona una foto de perfil.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Usar avatar generado',
        onPress: () => setDriverPhotoUrl('https://api.dicebear.com/7.x/avataaars/svg?seed=driver'),
      },
    ]);
  };

  const handlePickProviderPhoto = () => {
    Alert.alert('Foto de proveedor', 'Selecciona una foto de proveedor.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Usar avatar generado',
        onPress: () =>
          setProviderPhotoUrl('https://api.dicebear.com/7.x/avataaars/svg?seed=provider'),
      },
      {
        text: 'Usar foto del conductor',
        onPress: () =>
          setProviderPhotoUrl(
            driverPhotoUrl || 'https://api.dicebear.com/7.x/avataaars/svg?seed=driver'
          ),
      },
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
      setUserProfile({
        firstName,
        lastName,
        dni,
        phone: phone || userProfile?.phone || '',
        vehicleType,
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
      });

      // eslint-disable-next-line no-console
      console.log('[ProfileSetup] requiresProfileSetup:', requiresProfileSetup);

      if (requiresProfileSetup) {
        await completeProfileSetup({
          full_name: `${firstName} ${lastName}`.trim() || null,
          role,
          vehicle_data: {
            vehicle_type: vehicleType,
            brand,
            model,
            year: year ? parseInt(year, 10) : undefined,
            plate,
          },
        });
        navigation.replace('PaymentDetails', { fromOnboarding: true });
      } else {
        navigation.goBack();
      }
    } catch (err: any) {
      const message = err?.message || 'No se pudo guardar el perfil.';
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
            <Text style={styles.changePhotoText}>Cambiar foto de perfil</Text>
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
              <View style={styles.vehicleTypeRow}>
                {VEHICLE_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.vehicleTypeChip,
                      vehicleType === type && styles.vehicleTypeChipActive,
                    ]}
                    onPress={() => setVehicleType(type)}
                  >
                    <Text
                      style={[
                        styles.vehicleTypeText,
                        vehicleType === type && styles.vehicleTypeTextActive,
                      ]}
                    >
                      {type}
                    </Text>
                  </TouchableOpacity>
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
                {providerPhotoUrl ? 'Cambiar foto' : 'Subir foto de proveedor'}
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
    width: '65%',
    flexDirection: 'row',
    flexWrap: 'wrap',
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
