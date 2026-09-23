import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';

import { Alert } from '../lib/alert';
import { RootStackParamList } from '../navigation/RootNavigator';
import { IconoDeAtras } from '../components/IconoDeAtras';
import { InterruptorDeslizante } from '../components/InterruptorDeslizante';

type AppLockNav = StackNavigationProp<RootStackParamList, 'AppLock'>;

const DARK_BG = '#2D2D2D';

export function AppLockScreen() {
  const navigation = useNavigation<AppLockNav>();
  const [enabled, setEnabled] = useState(false);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <IconoDeAtras />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bloqueo de aplicación</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.body}>
        <View style={styles.option}>
          <View style={styles.optionInfo}>
            <Text style={styles.optionLabel}>Desbloquear con rasgos</Text>
          </View>
          <InterruptorDeslizante
            encendido={enabled}
            onCambiar={(value) => {
              setEnabled(value);
              Alert.alert(
                'Bloqueo de aplicación',
                value ? 'Desbloqueo con rasgos activado.' : 'Desbloqueo con rasgos desactivado.'
              );
            }}
            etiqueta="Desbloquear con rasgos"
          />
        </View>

        <Text style={styles.hint}>
          Si activas esta función, deberás usar tu huella dactilar, la cara u otro identificador
          único para abrir WhatsRemisse. Incluso cuando WhatsRemisse esté bloqueado, podrás
          contestar llamadas.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: DARK_BG,
    paddingTop: 50,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  backBtn: { padding: 4 },
  backArrow: { color: '#fff', fontSize: 24 },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: { width: 36 },
  body: { flex: 1, padding: 20 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  optionInfo: { flex: 1, marginRight: 12 },
  optionLabel: { fontSize: 16, color: '#111', fontWeight: '600' },
  hint: {
    fontSize: 13,
    color: '#666',
    marginTop: 16,
    lineHeight: 20,
  },
});
