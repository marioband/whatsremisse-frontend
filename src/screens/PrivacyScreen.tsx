import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from 'react-native';

import { RootStackParamList } from '../navigation/RootNavigator';
import { IconoDeAtras } from '../components/IconoDeAtras';

type PrivacyNav = StackNavigationProp<RootStackParamList, 'Privacy'>;

const DARK_BG = '#2D2D2D';

interface PrivacyOption {
  id: string;
  label: string;
  route: keyof RootStackParamList;
}

const OPTIONS: PrivacyOption[] = [
  { id: 'blocked-drivers', label: 'Conductores Bloqueados', route: 'BlockedDrivers' },
  { id: 'blocked-providers', label: 'Proveedores Bloqueados', route: 'BlockedProviders' },
  { id: 'app-lock', label: 'Bloqueo de aplicación', route: 'AppLock' },
];

export function PrivacyScreen() {
  const navigation = useNavigation<PrivacyNav>();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <IconoDeAtras />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacidad</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {OPTIONS.map((option, index) => (
          <TouchableOpacity
            key={option.id}
            style={[styles.option, index !== OPTIONS.length - 1 && styles.optionBorder]}
            onPress={() => {
              // @ts-ignore - rutas registradas
              navigation.navigate(option.route);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.optionLabel}>{option.label}</Text>
            <Text style={styles.optionArrow}>&gt;</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: DARK_BG,
    paddingTop: 50,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  backBtn: {
    padding: 4,
  },
  backArrow: {
    color: '#fff',
    fontSize: 24,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 36,
  },
  body: {
    flex: 1,
    backgroundColor: '#fff',
  },
  bodyContent: {
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  optionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  optionLabel: {
    flex: 1,
    fontSize: 16,
    color: '#111',
  },
  optionArrow: {
    fontSize: 18,
    color: '#aaa',
    fontWeight: '300',
  },
});
