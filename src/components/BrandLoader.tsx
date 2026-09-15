import React from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';

import logoWhatsRemisse from '../../assets/logo-whatsremisse.png';

/** Negro de marca usado en las pantallas de carga. */
export const BRAND_BG = '#333333';

/**
 * Tipografia del nombre en las pantallas de carga: la referencia de diseno usa
 * Helvetica/Arial, no la fuente por defecto del navegador (que en Windows cae en
 * Segoe UI y deja el nombre mas estrecho). En Android usamos el sans del sistema.
 */
const BRAND_FONT = Platform.select({
  ios: 'Helvetica Neue',
  android: 'sans-serif',
  default: "'Helvetica Neue', Helvetica, Arial, sans-serif",
});

/**
 * Pantalla de carga de marca: el globo del logo con el nombre debajo, centrado
 * sobre el negro de marca. Medidas tomadas de la referencia de diseno (globo de
 * 154x155 px de tinta, hueco de 27 px y wordmark de ~247x25 px) para que el
 * splash y la pantalla de registro se vean como una sola app.
 */
export function BrandLoader() {
  return (
    <View style={styles.container}>
      <Image source={logoWhatsRemisse} style={styles.logo} resizeMode="contain" />
      <Text style={styles.brand}>WhatsRemisse</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND_BG,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 156,
    height: 168,
  },
  brand: {
    color: '#fff',
    fontFamily: BRAND_FONT,
    fontSize: 35,
    fontWeight: 'bold',
    letterSpacing: 0.2,
    marginTop: 13,
  },
});
