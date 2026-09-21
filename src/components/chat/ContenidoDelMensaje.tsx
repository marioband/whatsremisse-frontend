import React, { useState } from 'react';
import {
  Image,
  Linking,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
} from 'react-native';

import { VisorDeFoto } from './VisorDeFoto';

/**
 * Lo que se pinta DENTRO de la burbuja, según la clase de mensaje (migración 0026).
 *
 * Vive en un solo sitio para que el chat del servicio y el del grupo se vean igual: una
 * foto se pinta como imagen (la URL viaja en `metadata.url`) —y **se abre a pantalla
 * completa al tocarla** (`VisorDeFoto`, 19-09-2026: antes no había forma de abrirla)— y una
 * ubicación como texto con su enlace para abrir el mapa (`metadata.lat` / `metadata.lng`).
 * Cualquier otra clase —texto, nota de voz, contacto— se pinta como texto, como siempre.
 */
interface Props {
  tipo?: string | null;
  contenido: string;
  metadata?: Record<string, any> | null;
  /** Estilo del texto (cada chat tiene su color, según quién escriba). */
  estiloTexto?: StyleProp<TextStyle>;
  /** Color del enlace al mapa: el de la hora de su burbuja (claro sobre azul, oscuro sobre gris). */
  colorDelEnlace?: string;
}

export function ContenidoDelMensaje({
  tipo,
  contenido,
  metadata,
  estiloTexto,
  colorDelEnlace,
}: Props) {
  /** ¿Está la foto abierta a pantalla completa? (pedido del usuario, 19-09-2026). */
  const [fotoAbierta, setFotoAbierta] = useState(false);

  if (tipo === 'PHOTO') {
    const url = (metadata?.url as string) || '';
    if (!url) return <Text style={estiloTexto}>{contenido}</Text>;
    return (
      <>
        <TouchableOpacity
          onPress={() => setFotoAbierta(true)}
          activeOpacity={0.85}
          accessibilityRole="imagebutton"
          accessibilityLabel="Abrir la foto"
        >
          <Image source={{ uri: url }} style={styles.photo} resizeMode="cover" />
        </TouchableOpacity>
        {fotoAbierta && (
          <VisorDeFoto url={url} pie={contenido} onCerrar={() => setFotoAbierta(false)} />
        )}
      </>
    );
  }

  if (tipo === 'LOCATION') {
    const lat = metadata?.lat as number | undefined;
    const lng = metadata?.lng as number | undefined;
    const hayCoordenadas = typeof lat === 'number' && typeof lng === 'number';
    const abrirMapa = () => {
      if (!hayCoordenadas) return;
      const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.open(url, '_blank');
        return;
      }
      Linking.openURL(url).catch(() => undefined);
    };
    return (
      <TouchableOpacity onPress={abrirMapa} disabled={!hayCoordenadas} activeOpacity={0.8}>
        <Text style={estiloTexto}>{contenido || '📍 Ubicación compartida'}</Text>
        <Text style={[styles.locationLink, colorDelEnlace ? { color: colorDelEnlace } : null]}>
          {hayCoordenadas ? 'Abrir en el mapa' : 'Sin coordenadas'}
        </Text>
      </TouchableOpacity>
    );
  }

  if (tipo === 'CONTACT') {
    const nombre = ((metadata?.nombre as string) || '').trim();
    const telefono = ((metadata?.telefono as string) || '').trim();
    // Los mensajes de contacto que se mandaron ANTES (20-09-2026) solo llevan el texto «👤 Contacto»
    // y ningún dato: se pintan como texto, como se veían, y no como una tarjeta vacía.
    if (!nombre && !telefono) return <Text style={estiloTexto}>{contenido}</Text>;
    const llamar = () => {
      const url = `tel:${telefono.replace(/[^\d+]/g, '')}`;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        // Un enlace `tel:` entrega la llamada al teléfono sin descargar la app (igual que el mapa).
        window.location.href = url;
        return;
      }
      Linking.openURL(url).catch(() => undefined);
    };
    return (
      <View style={styles.contacto}>
        <Text style={estiloTexto}>👤 {nombre || telefono}</Text>
        {!!telefono && (
          <TouchableOpacity onPress={llamar} activeOpacity={0.8}>
            <Text style={[styles.locationLink, colorDelEnlace ? { color: colorDelEnlace } : null]}>
              {telefono}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return <Text style={estiloTexto}>{contenido}</Text>;
}

const styles = StyleSheet.create({
  /** La foto ocupa el ancho disponible de la burbuja (el alto lo decide el navegador). */
  photo: { width: 210, height: 158, borderRadius: 10, backgroundColor: '#E4E6EF' },
  /** La tarjeta del contacto compartido: el nombre y, debajo, el teléfono que se puede tocar. */
  contacto: { maxWidth: 240 },
  locationLink: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    textDecorationLine: 'underline',
    color: '#555555',
  },
});
