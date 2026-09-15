import { RouteProp, useRoute } from '@react-navigation/native';
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

type LoginRoute = RouteProp<RootStackParamList, 'Login'>;

export function LoginScreen() {
  const route = useRoute<LoginRoute>();
  const { signIn, requireSmsVerification } = useAuth();
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  const phone = route.params?.phone || '';

  const handleLogin = async () => {
    if (requireSmsVerification && (!otp || otp.length < 6)) {
      Alert.alert('Código inválido', 'Ingresa el código de 6 dígitos.');
      return;
    }

    setLoading(true);
    try {
      const success = await signIn(phone, otp);
      if (!success) {
        Alert.alert(
          requireSmsVerification ? 'Código incorrecto' : 'Error',
          requireSmsVerification
            ? 'El código ingresado no es válido.'
            : 'No se pudo iniciar sesión. Intenta de nuevo.'
        );
      }
      // La navegación a Main o ProfileSetup la maneja RootNavigator según requiresProfileSetup
    } catch (err) {
      Alert.alert('Error al iniciar sesión', describeError(err));
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
        <Text style={styles.title}>{requireSmsVerification ? 'Validación' : 'Ingresar'}</Text>
        <Text style={styles.subtitle}>
          {requireSmsVerification
            ? `Ingresa el código enviado a ${phone || 'tu celular'}`
            : `Bienvenido ${phone || ''}`}
        </Text>

        {requireSmsVerification && (
          <TextInput
            style={styles.input}
            placeholder="codigo celular"
            placeholderTextColor="#999"
            keyboardType="number-pad"
            value={otp}
            onChangeText={setOtp}
            maxLength={6}
          />
        )}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Validando...' : requireSmsVerification ? 'Ingresar' : 'Continuar'}
          </Text>
        </TouchableOpacity>
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
    letterSpacing: 4,
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
  hint: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
  },
});
