import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

import { Icono, ICONO_COPIAR } from '../Icono';

interface BankDetailsRowProps {
  label: string;
  value: string;
  onCopy: (value: string) => void;
}

const BLUE = '#3F51B5';

export function BankDetailsRow({ label, value, onCopy }: BankDetailsRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.info}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
      </View>
      <TouchableOpacity
        style={styles.copyButton}
        onPress={() => onCopy(value)}
        accessibilityLabel={`Copiar ${label}`}
      >
        {/* Negro institucional, sin fondo: el icono manda (pedido del usuario, 19-09-2026). */}
        <Icono fuente={ICONO_COPIAR} tamano={16} color="#2D2D2D" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    // El campo ocupa TODO el ancho de la tarjeta. El 23-09-2026 se probó a la mitad y el usuario
    // lo devolvió a como estaba: «regresa a la configuración anterior, donde el campo ocupa todo el
    // espacio, déjalo como estaba antes».
  },
  info: { flex: 1 },
  label: { fontSize: 11, color: '#888', marginBottom: 2 },
  value: { fontSize: 14, color: '#111', fontWeight: '600' },
  copyButton: {
    // Sin fondo ni relleno: el botón es solo el icono (el usuario pidió quitar el fondo azul el
    // 19-09-2026). El color va en el componente (`color`), no en el estilo.
    paddingHorizontal: 4,
    paddingVertical: 2,
    marginLeft: 8,
  },
});
