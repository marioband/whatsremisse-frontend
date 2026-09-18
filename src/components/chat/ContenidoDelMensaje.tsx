import React from 'react';
import {
  Image,
  Linking,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
} from 'react-native';

/**
 * Lo que se pinta DENTRO de la burbuja, según la clase de mensaje (migración 0026).
 *
 * Vive en un solo sitio para que el chat del servicio y el del grupo se vean igual: una
 * foto se pinta como imagen (la URL viaja en `metadata.url`) y una ubicación como texto con
 * su enlace para abrir el mapa (`metadata.lat` / `metadata.lng`). Cualquier otra clase
 * —texto, nota de voz, contacto— se pinta como texto, como siempre.
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
  if (tipo === 'PHOTO') {
    const url = (metadata?.url as string) || '';
    if (!url) return <Text style={estiloTexto}>{contenido}</Text>;
    return <Image source={{ uri: url }} style={styles.photo} resizeMode="cover" />;
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

  return <Text style={estiloTexto}>{contenido}</Text>;
}

const styles = StyleSheet.create({
  /** La foto ocupa el ancho disponible de la burbuja (el alto lo decide el navegador). */
  photo: { width: 210, height: 158, borderRadius: 10, backgroundColor: '#E4E6EF' },
  locationLink: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    textDecorationLine: 'underline',
    color: '#555555',
  },
});
