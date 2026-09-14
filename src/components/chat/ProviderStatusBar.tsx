import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { ServiceAlert } from '../../types';

interface ProviderStatusBarProps {
  service: ServiceAlert;
}

const GREEN = '#4CD964';

export function ProviderStatusBar({ service }: ProviderStatusBarProps) {
  const step = service.driver_progress_step ?? 0;
  let text = 'en camino';
  if (step === 1) text = 'ubicado';
  else if (step === 2) text = 'iniciando viaje';
  else if (step >= 3) text = 'finalizado';

  return (
    <View style={styles.container}>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 50,
    backgroundColor: GREEN,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
