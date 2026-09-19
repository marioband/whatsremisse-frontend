import React from 'react';
import { Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

/**
 * La foto de un mensaje, a pantalla completa (pedido del usuario, 19-09-2026: «las fotos
 * enviadas por el chat no se pueden abrir»).
 *
 * Antes la foto se pintaba dentro de la burbuja y ahí se quedaba: no había forma de verla
 * entera. Ahora se toca y se abre encima de todo, con el fondo oscurecido. Se cierra tocando
 * el fondo, con la ✕ o con el botón de atrás del teléfono (`onRequestClose`); tocar la foto
 * NO la cierra (se absorbe el toque), porque agrandarla es justo lo que se viene a hacer.
 *
 * Es el MISMO componente para el chat del servicio y el de grupo, para que no se separen.
 */
interface Props {
  url: string | null;
  /** El texto que acompaña a la foto, si lo hay. */
  pie?: string;
  onCerrar: () => void;
}

export function VisorDeFoto({ url, pie, onCerrar }: Props) {
  if (!url) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCerrar}>
      <View style={styles.fondo}>
        {/* El fondo (todo menos la foto) cierra. Va debajo de la foto. */}
        <TouchableOpacity
          style={styles.capaDeCierre}
          activeOpacity={1}
          onPress={onCerrar}
          accessibilityRole="button"
          accessibilityLabel="Cerrar la foto"
        />
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => undefined}
          accessibilityRole="imagebutton"
          accessibilityLabel="Foto"
        >
          <Image source={{ uri: url }} style={styles.foto} resizeMode="contain" />
        </TouchableOpacity>
        {!!pie && (
          <Text style={styles.pie} numberOfLines={3}>
            {pie}
          </Text>
        )}
        <TouchableOpacity
          style={styles.cerrar}
          onPress={onCerrar}
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.cerrarTexto}>✕</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  capaDeCierre: { ...StyleSheet.absoluteFillObject },
  foto: { width: 360, height: 480, maxWidth: '100%' },
  pie: { color: '#fff', fontSize: 14, textAlign: 'center', marginTop: 12, paddingHorizontal: 12 },
  cerrar: { position: 'absolute', top: 17, right: 17, padding: 6 },
  cerrarTexto: { color: '#fff', fontSize: 26, fontWeight: '600' },
});
