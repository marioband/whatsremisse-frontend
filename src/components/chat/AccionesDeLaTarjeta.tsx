import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { OSCURO } from '../../lib/colors';
import { ServiceAlert } from '../../types';
import { CompartirViaje } from './CompartirViaje';

/**
 * Las acciones del viaje DENTRO de la tarjeta del chat (diseño del usuario, 09-10-2026):
 *
 *     [ foto del conductor ]             ← se toca para copiar la imagen (23-09-2026, se mantiene)
 *     [ Compartir viaje ]                ← botón largo, azul institucional
 *     [ Copiar datos | Copiar imagen ]   ← mitad y mitad, gris del conmutador «sin seleccionar»
 *     [ Ver ubicación ]                  ← botón largo, gris — VISUAL por ahora (decisión del
 *                                          usuario: el proveedor verá ahí dónde va su conductor;
 *                                          la función detallada llega en otra etapa)
 *
 * El orden de la pareja es el de la imagen de referencia: datos a la IZQUIERDA, imagen a la
 * derecha. La barra inferior de la tarjeta NO se pinta en el chat (duplicaba la franja verde
 * de arriba): eso se decide en `ServiceCard` con `sinFranja`.
 */
interface AccionesDeLaTarjetaProps {
  service: ServiceAlert;
  /** La foto del conductor, si la tiene. */
  foto?: string | null;
  /** La inicial que se pinta cuando no hay foto. */
  inicial: string;
  alCopiarDatos: () => void;
  /** Copia (o comparte) la FOTO del conductor. La usan la foto de arriba y «Copiar imagen». */
  alCopiarImagen: () => void;
}

export function AccionesDeLaTarjeta({
  service,
  foto,
  inicial,
  alCopiarDatos,
  alCopiarImagen,
}: AccionesDeLaTarjetaProps) {
  return (
    <View style={styles.zona}>
      {foto ? (
        <TouchableOpacity
          style={styles.foto}
          onPress={alCopiarImagen}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Copiar la foto del conductor"
        >
          <Image source={{ uri: foto }} style={styles.fotoImg} />
        </TouchableOpacity>
      ) : (
        <View style={styles.foto}>
          <Text style={styles.fotoInicial}>{inicial}</Text>
        </View>
      )}

      <CompartirViaje service={service} esProveedor />

      <View style={styles.fila}>
        <TouchableOpacity
          style={[styles.mitad, styles.mitadIzquierda]}
          onPress={alCopiarDatos}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="account" size={20} color="#555555" style={styles.icono} />
          <Text style={styles.texto}>Copiar datos</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.mitad} onPress={alCopiarImagen} activeOpacity={0.85}>
          <MaterialCommunityIcons name="image" size={20} color="#555555" style={styles.icono} />
          <Text style={styles.texto}>Copiar imagen</Text>
        </TouchableOpacity>
      </View>

      {/* Visual por ahora (decisión del usuario, 09-10-2026): su función llegará después. */}
      <View style={styles.verUbicacion}>
        <MaterialCommunityIcons
          name="map-marker"
          size={20}
          color="#555555"
          style={styles.icono}
        />
        <Text style={styles.texto}>Ver ubicación</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  zona: { alignItems: 'center', paddingHorizontal: 12, paddingBottom: 2 },
  foto: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: OSCURO,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 10,
  },
  fotoImg: { width: 36, height: 36 },
  fotoInicial: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  fila: { flexDirection: 'row', alignSelf: 'stretch', marginBottom: 10 },
  mitad: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f2f5',
    borderRadius: 12,
    paddingVertical: 14,
  },
  mitadIzquierda: { marginRight: 10 },
  verUbicacion: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f2f5',
    borderRadius: 12,
    paddingVertical: 14,
  },
  icono: { marginRight: 8 },
  texto: { color: '#555555', fontSize: 15, fontWeight: '600' },
});
