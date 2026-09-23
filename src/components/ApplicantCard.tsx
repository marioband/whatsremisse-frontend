import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';

import {
  AZUL,
  FONDO_TARJETA,
  OSCURO,
  ROJO_ACCION,
  TEXTO,
  TEXTO_SUAVE,
  VERDE_ACCION,
} from '../lib/colors';
import { conGuion, DatosPublicos, inicialDe, lineaDeDos } from '../lib/perfilPublico';
import {
  copiarOCompartirImagen,
  mensajeDeCopiarImagen,
} from '../lib/copiarImagen';
import { Alert } from '../lib/alert';

/**
 * Tarjeta de un postulante, con la estructura de la referencia del usuario (22-09 y 23-09-2026):
 *
 *   [        tipo de unidad del postulante (centrado)                 ]
 *   [        tiempo y distancia al punto de origen (centrado)        ]
 *   (avatar)      Mario André, Baldeón Andía
 *                 Mitsubishi, Lancer
 *                 Color: Rojo Metálico
 *   [ Aceptar ]  [ Conversar ]  [ Rechazar ]
 *
 * 23-09-2026 — el usuario confirmó recortar la tarjeta a su dibujo: los nombres y apellidos van
 * JUNTOS, la marca y el modelo también, y **fuera el DNI, el celular y la placa** (el dibujo no los
 * tiene). «Color:» conserva su etiqueta, como en el dibujo. Los tres datos van en UNA columna
 * centrada, con el avatar a la izquierda.
 *
 * OJO: los botones NO cambiaron. El dibujo dice «Chatear» y lo pone primero, pero el usuario fijó que
 * las capturas son referencia de ESTRUCTURA y los textos de la app se conservan («Conversar»).
 *
 * Vive en su propio componente para poder renderizarse y medirse en las pruebas.
 */
export interface ApplicantCardProps {
  datos: DatosPublicos;
  /** Texto del tiempo y la distancia al origen (\"(2 min 1.3 km)\"); vacío = no se pinta. */
  estimacion?: string;
  onAceptar: () => void;
  onConversar: () => void;
  onRechazar: () => void;
}

export function ApplicantCard({
  datos,
  estimacion,
  onAceptar,
  onConversar,
  onRechazar,
}: ApplicantCardProps) {
  return (
    <View style={styles.card}>
      {/* El tipo de unidad del postulante, en el primer renglón (referencia del usuario,
          22-09-2026: en su dibujo ese renglón dice «Auto»). Si no lo tenemos, no se pinta. */}
      {!!datos.unidad && <Text style={styles.unidadTop}>{datos.unidad}</Text>}
      {!!estimacion && <Text style={styles.estimateTop}>{estimacion}</Text>}

      <View style={styles.topRow}>
        {datos.foto ? (
          /* La foto se toca y se copia (23-09-2026): en iPhone Safari no se puede escribir una
             imagen en el portapapeles, así que ahí se abre la hoja de compartir con la foto
             (Guardar en Fotos, WhatsApp…), que es el equivalente real. */
          <TouchableOpacity
            onPress={() => {
              const nombre = [datos.nombres, datos.apellidos].filter(Boolean).join(' ') || 'conductor';
              copiarOCompartirImagen(datos.foto, nombre).then((resultado) =>
                Alert.alert('Foto del conductor', mensajeDeCopiarImagen(resultado))
              );
            }}
            accessibilityRole="button"
            accessibilityLabel="Copiar la foto del conductor"
          >
            <Image source={{ uri: datos.foto }} style={styles.avatar} />
          </TouchableOpacity>
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{inicialDe(datos)}</Text>
          </View>
        )}

        {/* 23-09-2026: nombres y apellidos juntos, marca y modelo juntos, y nada de DNI, celular ni
            placa (el dibujo del usuario no los tiene). Todo en una columna centrada. */}
        <View style={styles.dataColumna}>
          <Text style={styles.fieldText}>{lineaDeDos(datos.nombres, datos.apellidos)}</Text>
          <Text style={styles.fieldText}>{lineaDeDos(datos.marca, datos.modelo)}</Text>
          <Text style={styles.fieldText}>Color: {conGuion(datos.color)}</Text>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.acceptBtn]}
          onPress={onAceptar}
          activeOpacity={0.85}
        >
          <Text style={styles.actionBtnText}>Aceptar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.chatBtn]}
          onPress={onConversar}
          activeOpacity={0.85}
        >
          <Text style={styles.actionBtnText}>Conversar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.rejectBtn]}
          onPress={onRechazar}
          activeOpacity={0.85}
        >
          <Text style={styles.actionBtnText}>Rechazar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: FONDO_TARJETA,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  /** Tipo de unidad del postulante: el primer renglón de la tarjeta, centrado. */
  unidadTop: {
    fontSize: 14,
    fontWeight: '700',
    color: OSCURO,
    textAlign: 'center',
    marginBottom: 2,
  },
  /** Tiempo y distancia al punto de origen, centrado arriba (referencia del usuario). */
  estimateTop: {
    fontSize: 13,
    color: TEXTO,
    textAlign: 'center',
    marginBottom: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  /** El círculo del avatar: en el dibujo del usuario es grande, con el texto a su derecha. */
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: OSCURO,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  /** Una sola columna de datos, centrada (23-09-2026: antes eran dos, una por lado). */
  dataColumna: {
    flex: 1,
    alignItems: 'center',
  },
  fieldText: {
    fontSize: 13,
    color: OSCURO,
    textAlign: 'center',
    marginBottom: 3,
  },
  actionsRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  acceptBtn: {
    backgroundColor: VERDE_ACCION,
    marginRight: 5,
  },
  chatBtn: {
    backgroundColor: AZUL,
    marginRight: 5,
  },
  rejectBtn: {
    backgroundColor: ROJO_ACCION,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
