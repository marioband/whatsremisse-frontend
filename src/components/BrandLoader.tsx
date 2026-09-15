import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

import logoWhatsRemisse from '../../assets/logo-whatsremisse-name.png';

/** Negro de marca usado en las pantallas de carga. */
export const BRAND_BG = '#333333';

interface BrandLoaderProps {
  /** Ancho/alto del logo en px (el asset es cuadrado). */
  size?: number;
}

/**
 * Pantalla de carga de marca: el logo de WhatsRemisse centrado sobre el negro
 * de marca. El asset se genera desde `assets/logo-whatsremisse.svg`, la fuente
 * de verdad del logo, y se usa en el splash y mientras la app resuelve la
 * sesión o valida el código de acceso.
 */
export function BrandLoader({ size = 240 }: BrandLoaderProps) {
  return (
    <View style={styles.container}>
      <Image source={logoWhatsRemisse} style={{ width: size, height: size }} resizeMode="contain" />
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
});
