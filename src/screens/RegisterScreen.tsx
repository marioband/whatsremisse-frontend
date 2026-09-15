import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

import { useAuth } from '../context/AuthContext';
import { describeError } from '../lib/errors';
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
        return;
      }

      await requestOtp(phone);
      Alert.alert('Código enviado', `Se envió el código al ${phone}.`);
      navigation.navigate('Login', { phone });
    } catch (err) {
      const message = describeError(err);
      setError(message);
      Alert.alert('No se pudo continuar', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.logoContainer}>
        <View style={styles.bubble}>
          <View style={styles.bubbleTail} />
        </View>
        <Text style={styles.brand}>WhatsRemisse</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Registro</Text>
        <Text style={styles.subtitle}>Ingresa tu número celular</Text>

        <TextInput
          style={styles.input}
          placeholder="Número Celular"
          placeholderTextColor="#999"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
          maxLength={12}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSend}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Enviando...' : 'enviar'}</Text>
        </TouchableOpacity>

        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2D2D2D',
    justifyContent: 'center',
    padding: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  bubble: {
    width: 80,
    height: 62,
    backgroundColor: '#fff',
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  bubbleTail: {
    position: 'absolute',
    bottom: -9,
    left: 10,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderTopWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#fff',
  },
  brand: {
    color: '#fff',
    fontSize: 26,
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: '#2D2D2D',
    width: '100%',
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    color: '#bbb',
    fontSize: 14,
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#3B4CCA',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
  },
});
