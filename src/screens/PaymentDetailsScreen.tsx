import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
} from 'react-native';

import { useMockStore } from '../context/MockStoreContext';
import { RootStackParamList } from '../navigation/RootNavigator';

type PaymentNav = StackNavigationProp<RootStackParamList, 'PaymentDetails'>;
type PaymentRoute = RouteProp<RootStackParamList, 'PaymentDetails'>;

const DARK_BG = '#2D2D2D';
const BLUE = '#3F51B5';

export function PaymentDetailsScreen() {
  const navigation = useNavigation<PaymentNav>();
  const route = useRoute<PaymentRoute>();
  const { userProfile, setUserProfile } = useMockStore();
  const fromOnboarding = route.params?.fromOnboarding ?? false;

  const [yape, setYape] = useState(userProfile?.yapeNumber || '');
  const [bcpAccount, setBcpAccount] = useState(userProfile?.bcpAccount || '');
  const [bcpCci, setBcpCci] = useState(userProfile?.bcpCci || '');

  const handleSave = () => {
    if (!userProfile) return;
    setUserProfile({
      ...userProfile,
      yapeNumber: yape,
      bcpAccount,
      bcpCci,
    });
    Alert.alert('Guardado', 'Tus datos de pago han sido actualizados.');
    if (fromOnboarding) {
      navigation.replace('Main');
    } else {
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Datos de pago</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <Text style={styles.sectionTitle}>Métodos de pago P2P</Text>
        <Text style={styles.sectionSubtitle}>
          Estos datos se compartirán con los conductores para realizar transferencias.
        </Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Número Yape</Text>
          <TextInput
            style={styles.input}
            placeholder="Número Yape"
            value={yape}
            onChangeText={setYape}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Cuenta BCP</Text>
          <TextInput
            style={styles.input}
            placeholder="Cuenta BCP"
            value={bcpAccount}
            onChangeText={setBcpAccount}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>CCI BCP</Text>
          <TextInput
            style={styles.input}
            placeholder="CCI BCP"
            value={bcpCci}
            onChangeText={setBcpCci}
          />
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Guardar</Text>
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
  inputGroup: { marginBottom: 18 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  input: {
    backgroundColor: '#F2F2F2',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111',
  },
  saveButton: {
    backgroundColor: BLUE,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
