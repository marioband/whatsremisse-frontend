import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';

/**
 * La flecha «atrás» de TODA la app, con la forma del atrás de WhatsApp (23-09-2026).
 *
 * Antes cada pantalla dibujaba el carácter «←» con un `Text`, y el usuario lo rechazó:
 * la línea gráfica de la app usa los iconos de MaterialCommunityIcons (el candado, la
 * campana, el pin, la papelera…), no flechas de texto, que además se dibujan distinto en
 * cada teléfono. Es la misma razón por la que los emojis de Privacidad se van.
 *
 * Es un **chevron limpio, sin raya** (el de su captura de WhatsApp), no una flecha con
 * asta. El círculo oscuro que rodea la flecha en esa captura es el recorte de la imagen,
 * no el botón: nuestras cabeceras ya son `#2D2D2D` y un círculo más oscuro no se vería.
 *
 * Va SIN `TouchableOpacity` alrededor a propósito: cada pantalla conserva su envoltorio,
 * así el `onPress`, el área táctil y la etiqueta de accesibilidad siguen siendo los de
 * antes y este cambio es solo el dibujo.
 */
export function IconoDeAtras({
  tamano = 28,
  color = '#fff',
}: {
  tamano?: number;
  color?: string;
}) {
  return <MaterialCommunityIcons name="chevron-left" size={tamano} color={color} />;
}
