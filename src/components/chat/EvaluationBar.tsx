import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface EvaluationBarProps {
  onAccept: () => void;
  onReject: () => void;
}

export function EvaluationBar({ onAccept, onReject }: EvaluationBarProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity style={[styles.button, styles.acceptBtn]} onPress={onAccept}>
        <Text style={styles.buttonText}>Aceptar</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.rejectBtn]} onPress={onReject}>
        <Text style={styles.buttonText}>Rechazar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#F2F2F2',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 20,
    alignItems: 'center',
  },
  acceptBtn: { backgroundColor: '#25D366', marginRight: 8 },
  rejectBtn: { backgroundColor: '#ff3b30', marginLeft: 8 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});
