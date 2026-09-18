import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';

import { Icono, ICONO_AJUSTES } from './Icono';
import { RootStackParamList } from '../navigation/RootNavigator';

type HeaderNav = StackNavigationProp<RootStackParamList, 'Main'>;

const DARK_BG = '#2D2D2D';
const BLUE = '#3F51B5';

export type MainTab = 'Conductor' | 'Proveedor' | 'Mis Grupos';

const TABS: MainTab[] = ['Conductor', 'Proveedor', 'Mis Grupos'];

interface MainHeaderProps {
  activeTab: MainTab;
  onTabChange: (tab: MainTab) => void;
}

export function MainHeader({ activeTab, onTabChange }: MainHeaderProps) {
  const navigation = useNavigation<HeaderNav>();

  return (
    <SafeAreaView style={styles.wrapper}>
      {/* Header oscuro */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>WhatsRemisse</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('Settings')}
            accessibilityLabel="Ajustes"
          >
            <Icono fuente={ICONO_AJUSTES} tamano={22} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Role tabs */}
      <View style={styles.roleBar}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.roleTab, activeTab === tab && styles.roleTabActive]}
            onPress={() => onTabChange(tab)}
          >
            <Text style={[styles.roleTabText, activeTab === tab && styles.roleTabTextActive]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: DARK_BG,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: DARK_BG,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerIcons: {
    flexDirection: 'row',
  },
  iconBtn: {
    marginLeft: 16,
    padding: 4,
  },
  icon: {
    fontSize: 20,
    color: '#fff',
  },
  roleBar: {
    flexDirection: 'row',
    backgroundColor: DARK_BG,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  roleTab: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  roleTabActive: {
    backgroundColor: BLUE,
  },
  roleTabText: {
    color: '#ccc',
    fontSize: 13,
    fontWeight: '600',
  },
  roleTabTextActive: {
    color: '#fff',
  },
});
