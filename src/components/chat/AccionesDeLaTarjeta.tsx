import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { FONDO_TARJETA } from '../../lib/colors';
import { ServiceAlert } from '../../types';
import { CompartirViaje } from './CompartirViaje';

/**
 * Las acciones del viaje DENTRO de la tarjeta del chat (diseño del usuario, 09-10-2026):
 *
 *     [ Compartir viaje ]                ← botón largo azul institucional (con sus márgenes)
 *     ┌──────────────┬───────────────┐
 *     │ Copiar datos │ Copiar imagen │   ← los grises van PEGADOS formando un bloque del
 *     ├──────────────┴───────────────┤     MISMO color que la tarjeta (`FONDO_TARJETA`):
 *     │        Ver ubicación         │     la única división entre ellos son sus líneas
 *     └──────────────────────────────┘     blancas finas (3ª vuelta del usuario).
 *
 * La FOTO del conductor se quitó (2ª vuelta): su función de copiar la imagen la tiene el botón
 * «Copiar imagen». «Ver ubicación» es VISUAL por ahora (la función detallada llega en otra
 * etapa). El orden de la pareja es el de la imagen de referencia: datos IZQUIERDA, imagen
 * DERECHA. La barra inferior de la tarjeta NO se pinta en el chat (`ServiceCard` `sinFranja`).
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
  /** Sin márgenes laterales: el bloque gris llega hasta los bordes de la tarjeta. */
  zona: {},
  fila: { flexDirection: 'row' },
  mitad: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // El MISMO color que la tarjeta (pedido del usuario, 09-10-2026): los botones no llevan
    // fondo propio — lo que los delimita son sus líneas blancas.
    backgroundColor: FONDO_TARJETA,
    paddingVertical: 14,
  },
  /** La única división con «Copiar imagen»: la línea blanca del borde. */
  mitadIzquierda: { borderRightWidth: 1.5, borderColor: '#FFFFFF' },
  verUbicacion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FONDO_TARJETA,
    borderTopWidth: 1.5,
    borderColor: '#FFFFFF',
    paddingVertical: 14,
  },
  icono: { marginRight: 8 },
  texto: { color: '#555555', fontSize: 15, fontWeight: '600' },
});
