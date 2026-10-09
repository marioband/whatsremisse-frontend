import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ServiceAlert } from '../../types';
import { CompartirViaje } from './CompartirViaje';

/**
 * Las acciones del viaje DENTRO de la tarjeta del chat (diseño del usuario, 09-10-2026):
 *
 *     [ Compartir viaje ]                ← botón largo, azul institucional
 *     [ Copiar datos | Copiar imagen ]   ← mitad y mitad, gris del conmutador «sin seleccionar»
 *     [ Ver ubicación ]                  ← botón largo, gris — VISUAL por ahora (decisión del
 *                                          usuario: el proveedor verá ahí dónde va su conductor;
 *                                          la función detallada llega en otra etapa)
 *
 * La FOTO del conductor se quitó (2ª vuelta del usuario, 09-10-2026): su función de copiar la
 * imagen la tiene ahora el botón «Copiar imagen». Los botones grises llevan un borde BLANCO
 * fino para despegarse del fondo de la tarjeta (que es del mismo gris) y entre sí.
 *
 * El orden de la pareja es el de la imagen de referencia: datos a la IZQUIERDA, imagen a la
 * derecha. La barra inferior de la tarjeta NO se pinta en el chat (duplicaba la franja verde
 * de arriba): eso se decide en `ServiceCard` con `sinFranja`.
 */
interface AccionesDeLaTarjetaProps {
  service: ServiceAlert;
  alCopiarDatos: () => void;
  /** Copia (o comparte) la FOTO del conductor. La usa el botón «Copiar imagen». */
  alCopiarImagen: () => void;
}

export function AccionesDeLaTarjeta({
  service,
  alCopiarDatos,
  alCopiarImagen,
}: AccionesDeLaTarjetaProps) {
  return (
    <View style={styles.zona}>
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
  fila: { flexDirection: 'row', alignSelf: 'stretch', marginBottom: 10 },
  mitad: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f2f5',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
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
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
  },
  icono: { marginRight: 8 },
  texto: { color: '#555555', fontSize: 15, fontWeight: '600' },
});
