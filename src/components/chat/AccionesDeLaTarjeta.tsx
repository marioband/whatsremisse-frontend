import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { FONDO_TARJETA } from '../../lib/colors';
import { ServiceAlert } from '../../types';
import { CompartirViaje } from './CompartirViaje';
import { VerUbicacionDelConductor } from './VerUbicacionDelConductor';

/**
 * Las acciones del viaje DENTRO de la tarjeta del chat (diseño del usuario, 09-10-2026):
 *
 *     [ Compartir viaje ]                ← botón largo azul institucional (texto solo, centrado)
 *     ┌──────────────┬───────────────┐
 *     │ Copiar datos │ Copiar imagen │   ← los grises van PEGADOS formando un bloque del
 *     ├──────────────┴───────────────┤     MISMO color que la tarjeta (`FONDO_TARJETA`):
 *     │  📍 Ver ubicación            │     la única división son sus líneas blancas finas.
 *     └──────────────────────────────┘     Solo «Ver ubicación» lleva icono (el pin): los
 *                                          copiados y el azul van SIN icono (4ª vuelta del
 *                                          usuario: «copiar imagen» se veía corrido a la
 *                                          derecha por el icono, y su referencia no los tiene).
 *
 * La FOTO del conductor se quitó (2ª vuelta): su función de copiar la imagen la tiene el botón
 * «Copiar imagen». «Ver ubicación» es VISUAL por ahora (la función detallada llega en otra
 * etapa). El orden de la pareja es el de la referencia: datos IZQUIERDA, imagen DERECHA. La
 * barra inferior de la tarjeta NO se pinta en el chat (`ServiceCard` `sinFranja`).
 */
interface AccionesDeLaTarjetaProps {
  service: ServiceAlert;
  /**
   * ¿La cuenta del proveedor está SELECCIONADA por el administrador? (0051) — El botón
   * «Compartir viaje» es exclusivo de esas cuentas; con esto en false, el pie solo lleva los
   * copiados y «Ver ubicación».
   */
  puedeCompartir: boolean;
  alCopiarDatos: () => void;
  /** Copia (o comparte) la FOTO del conductor. La usa el botón «Copiar imagen». */
  alCopiarImagen: () => void;
}

export function AccionesDeLaTarjeta({
  service,
  puedeCompartir,
  alCopiarDatos,
  alCopiarImagen,
}: AccionesDeLaTarjetaProps) {
  return (
    <View style={styles.zona}>
      {puedeCompartir && <CompartirViaje service={service} esProveedor />}

      <View style={styles.fila}>
        <TouchableOpacity
          style={[styles.mitad, styles.mitadIzquierda]}
          onPress={alCopiarDatos}
          activeOpacity={0.85}
        >
          <Text style={styles.texto}>Copiar datos</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.mitad} onPress={alCopiarImagen} activeOpacity={0.85}>
          <Text style={styles.texto}>Copiar imagen</Text>
        </TouchableOpacity>
      </View>

      {/* «Ver ubicación» (0053, 10-10-2026): ahora pide ver al conductor en vivo y, aceptado,
          abre el mapa. Vive en su componente porque tiene sus estados (pedido, aceptado,
          rechazado…) y su propio reloj de refresco. */}
      <VerUbicacionDelConductor service={service} />
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
  texto: { color: '#555555', fontSize: 15, fontWeight: '600' },
});
