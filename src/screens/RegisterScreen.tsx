import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

import logoWhatsRemisse from '../../assets/logo-whatsremisse.png';
import { useAuth } from '../context/AuthContext';
import { CODIGO_POR_DEFECTO, celularCompleto, formatoDeCelular } from '../lib/celular';
import { Alert } from '../lib/alert';
import { textoDeErrorParaElUsuario } from '../lib/errors';
import { RootStackParamList } from '../navigation/RootNavigator';

type RegisterNav = StackNavigationProp<RootStackParamList, 'Register'>;

// Colores de marca.
const BRAND_BLACK = '#333333';
const BRAND_BLUE = '#35458F';
const FIELD_BG = '#F5F5F5';
const PLACEHOLDER = '#B5B5B5';

export function RegisterScreen() {
  const navigation = useNavigation<RegisterNav>();
  const { requestOtp, signIn, requireSmsVerification } = useAuth();
  // El código de país va en su propio campo y viene con +51 puesto (se puede editar); el número, en
  // el suyo. A la base de cuentas viaja el número COMPLETO (código + número), que es la identidad.
  const [codigo, setCodigo] = useState<string>(CODIGO_POR_DEFECTO);
  const [numero, setNumero] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    const soloDigitos = numero.replace(/\D/g, '');
    if (soloDigitos.length < 9) {
      setError('Ingresa un número de celular válido.');
      return;
    }

    // Con el código delante: es la identidad (y la contraseña) con la que entra o se crea la cuenta.
    const completo = celularCompleto(codigo, soloDigitos);
    setLoading(true);
    setError(null);
    try {
      if (!requireSmsVerification) {
        const success = await signIn(completo, '');
        // eslint-disable-next-line no-console
        console.log('[Register] signIn result:', success);
        if (!success) {
          setError('No se pudo iniciar sesión. Verifica tu número o intenta de nuevo.');
        }
        return;
      }

      await requestOtp(completo);
      Alert.alert('Código enviado', `Se envió el código al ${formatoDeCelular(completo)}.`);
      navigation.navigate('Login', { phone: completo });
    } catch (err) {
      const message = textoDeErrorParaElUsuario(err);
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
      {/* Logo de marca */}
      <View style={styles.logoBlock}>
        <Image source={logoWhatsRemisse} style={styles.logo} resizeMode="contain" />
        <Text style={styles.brand}>WhatsRemisse</Text>
      </View>

      {/* Campo de número, con su código de país (pedido del usuario, 22-09-2026): el código viene
          con +51 puesto y se puede editar; el número va al lado. */}
      <View style={styles.phoneRow}>
        <TextInput
          style={[styles.input, styles.inputCodigo]}
          placeholder="+51"
          placeholderTextColor={PLACEHOLDER}
          keyboardType="phone-pad"
          value={codigo}
          onChangeText={setCodigo}
          maxLength={5}
          accessibilityLabel="Código de país"
        />
        <TextInput
          style={[styles.input, styles.inputNumero]}
          placeholder="Número Celular"
          placeholderTextColor={PLACEHOLDER}
          keyboardType="phone-pad"
          value={numero}
          onChangeText={setNumero}
          maxLength={12}
        />
      </View>

      <View style={styles.spacer} />

      {/* Botón enviar, anclado abajo */}
      <View style={styles.footer}>
        {error && <Text style={styles.errorText}>{error}</Text>}
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSend}
          disabled={loading}
        >
          {/* El texto va como en los demás botones de la app: en mayúscula inicial y en negrita
              (antes era «enviar», en minúscula y sin negrita). Pedido del usuario, 20-09-2026. */}
          <Text style={styles.buttonText}>{loading ? 'Enviando...' : 'Enviar'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND_BLACK,
    paddingHorizontal: 20,
  },
  logoBlock: {
    alignItems: 'center',
    marginTop: 44,
  },
  logo: {
    width: 118,
    height: 127,
  },
  brand: {
    color: '#fff',
    fontSize: 26,
    fontWeight: 'bold',
    marginTop: 8,
    letterSpacing: 0.2,
  },
  /* Código de país y número, en la misma fila. */
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 36,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  input: {
    backgroundColor: FIELD_BG,
    borderRadius: 8,
    height: 36,
    paddingHorizontal: 14,
    fontSize: 18,
    color: '#333',
    textAlign: 'center',
    outlineStyle: 'none',
    borderWidth: 0,
  },
  /** El código necesita poco ancho; el número se queda con el resto. */
  inputCodigo: {
    width: 64,
    marginRight: 10,
  },
  inputNumero: { width: 210 },
  spacer: {
    flex: 1,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 30,
  },
  button: {
    // La MISMA forma que los botones de la app (los de Guardar/Aceptar): ancho completo dentro de
    // su contenedor, esquinas de 12, 16 de alto el texto y el azul de marca. Antes era un botón
    // pequeño pegado abajo que no se parecía a nada (reporte del usuario, 19-09-2026).
    backgroundColor: BRAND_BLUE,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    // Igual que los botones de Guardar/Crear/Aceptar del resto de la app.
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorText: {
    color: '#FF8A80',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
});
