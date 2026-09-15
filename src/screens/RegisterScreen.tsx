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

// Diseño original de la pantalla de registro.
const DARK_BG = '#383838';
const BUTTON_BLUE = '#2B3B9E';
const FIELD_BG = '#F5F5F5';
const PLACEHOLDER = '#B5B5B5';

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
      {/* Logo: globo con silueta de persona con traje */}
      <View style={styles.logoBlock}>
        <View style={styles.bubbleWrapper}>
          <View style={styles.bubbleRing} />
          <View style={styles.bubbleTail} />
          <View style={styles.person}>
            <View style={styles.head} />
            <View style={styles.torso}>
              <View style={styles.suitCollar} />
            </View>
          </View>
        </View>
        <Text style={styles.brand}>WhatsRemisse</Text>
      </View>

      {/* Campo de número */}
      <TextInput
        style={styles.input}
        placeholder="Número Celular"
        placeholderTextColor={PLACEHOLDER}
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
        maxLength={12}
      />

      <View style={styles.spacer} />

      {/* Botón enviar, anclado abajo */}
      <View style={styles.footer}>
        {error && <Text style={styles.errorText}>{error}</Text>}
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSend}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'enviando...' : 'enviar'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const BUBBLE_SIZE = 118;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BG,
    paddingHorizontal: 20,
  },
  logoBlock: {
    alignItems: 'center',
    marginTop: 48,
  },
  bubbleWrapper: {
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE + 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleRing: {
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    borderWidth: 9,
    borderColor: '#fff',
    position: 'absolute',
    top: 0,
  },
  bubbleTail: {
    position: 'absolute',
    left: 22,
    bottom: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 15,
    borderRightWidth: 15,
    borderTopWidth: 30,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#fff',
    transform: [{ rotate: '-12deg' }],
  },
  person: {
    alignItems: 'center',
    marginTop: 4,
  },
  head: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    marginBottom: 3,
  },
  torso: {
    width: 64,
    height: 40,
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    alignItems: 'center',
    overflow: 'hidden',
  },
  suitCollar: {
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderTopWidth: 34,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: DARK_BG,
  },
  brand: {
    color: '#fff',
    fontSize: 26,
    fontWeight: 'bold',
    marginTop: 6,
    letterSpacing: 0.2,
  },
  input: {
    backgroundColor: FIELD_BG,
    borderRadius: 8,
    height: 36,
    marginTop: 36,
    paddingHorizontal: 14,
    fontSize: 18,
    color: '#333',
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 30,
  },
  spacer: {
    flex: 1,
  },
  button: {
    backgroundColor: BUTTON_BLUE,
    borderRadius: 5,
    paddingVertical: 7,
    paddingHorizontal: 28,
    minWidth: 112,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
  },
  errorText: {
    color: '#FF8A80',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
});
