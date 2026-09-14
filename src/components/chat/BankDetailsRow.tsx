import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

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
      <TouchableOpacity style={styles.copyButton} onPress={() => onCopy(value)}>
        <Text style={styles.copyButtonText}>📋</Text>
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
  },
  info: { flex: 1 },
  label: { fontSize: 11, color: '#888', marginBottom: 2 },
  value: { fontSize: 14, color: '#111', fontWeight: '600' },
  copyButton: {
    backgroundColor: BLUE,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 8,
  },
  copyButtonText: { color: '#fff', fontSize: 14 },
});
