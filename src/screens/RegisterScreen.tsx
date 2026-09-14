import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../navigation/RootNavigator';

type RegisterNav = StackNavigationProp<RootStackParamList, 'Register'>;

export function RegisterScreen() {
  const navigation = useNavigation<RegisterNav>();
  const { requestOtp, signIn, requireSmsVerification } = useAuth();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    if (!phone || phone.length < 9) {
      setError('Ingresa un número de celular válido.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (!requireSmsVerification) {
        const success = await signIn(phone, '');
        // eslint-disable-next-line no-console
        console.log('[Register] signIn result:', success);
        if (!success) {
          setError('No se pudo iniciar sesión. Verifica tu número o intenta de nuevo.');
        }
      } else {
        const success = await requestOtp(phone);
        if (success) {
          navigation.navigate('VerifyOtp', { phone });
        } else {
          setError('No se pudo enviar el código SMS.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error inesperado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>WhatsRemisse</Text>
      <Text style={styles.subtitle}>Ingresa tu número de celular para continuar</Text>
      <TextInput
        style={styles.input}
        placeholder="Ej. 987654321"
        placeholderTextColor="#888"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
      <TouchableOpacity style={styles.button} onPress={handleSend} disabled={loading}>
        {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Continuar</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#2D2D2D' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#FFF', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#AAA', textAlign: 'center', marginBottom: 24 },
  input: { backgroundColor: '#3A3A3A', color: '#FFF', padding: 14, borderRadius: 8, fontSize: 16, marginBottom: 12 },
  button: { backgroundColor: '#3F51B5', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  errorText: { color: '#FF6B6B', fontSize: 14, textAlign: 'center', marginTop: 16 },
});
