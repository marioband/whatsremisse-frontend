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
import { conGuion, DatosPublicos, inicialDe } from '../lib/perfilPublico';

/**
 * Tarjeta de un postulante, con la estructura de la referencia del usuario:
 *
 *   [        tiempo y distancia al punto de origen (centrado)        ]
 *   (avatar)  Nombres: …        Marca: …
 *             Apellidos: …      Modelo: …
 *             DNI: …            Color: …
 *             Celular: …        Placa: …
 *   [ Aceptar ]  [ Conversar ]  [ Rechazar ]
 *
 * Sin títulos de sección: los datos del conductor van en la columna izquierda y los
 * del vehículo en la derecha, al lado. Vive en su propio componente para poder
 * renderizarse y medirse en las pruebas (la pantalla solo le pasa los datos).
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
      {!!estimacion && <Text style={styles.estimateTop}>{estimacion}</Text>}

      <View style={styles.topRow}>
        {datos.foto ? (
          <Image source={{ uri: datos.foto }} style={styles.avatar} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{inicialDe(datos)}</Text>
          </View>
        )}

        <View style={styles.dataColumns}>
          <View style={[styles.dataColumn, styles.dataColumnAncha]}>
            <Text style={styles.fieldText}>Nombres: {conGuion(datos.nombres)}</Text>
            <Text style={styles.fieldText}>Apellidos: {conGuion(datos.apellidos)}</Text>
            <Text style={styles.fieldText}>DNI: {conGuion(datos.dni)}</Text>
            <Text style={styles.fieldText}>Celular: {conGuion(datos.telefono)}</Text>
          </View>
          <View style={styles.dataColumn}>
            <Text style={styles.fieldText}>Marca: {conGuion(datos.marca)}</Text>
            <Text style={styles.fieldText}>Modelo: {conGuion(datos.modelo)}</Text>
            <Text style={styles.fieldText}>Color: {conGuion(datos.color)}</Text>
            <Text style={styles.fieldText}>Placa: {conGuion(datos.placa)}</Text>
          </View>
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
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: OSCURO,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  /** Dos columnas de datos: conductor | vehículo, sin títulos. */
  dataColumns: {
    flex: 1,
    flexDirection: 'row',
  },
  /** El conductor a la izquierda ocupa algo más: sus campos son los más largos. */
  dataColumn: {
    flex: 1,
  },
  dataColumnAncha: {
    flex: 1.35,
  },
  fieldText: {
    fontSize: 12,
    color: TEXTO_SUAVE,
    marginBottom: 2,
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
