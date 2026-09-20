import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';

import { DriverHomeScreen } from './DriverHomeScreen';
import { MyGroupsScreen } from './MyGroupsScreen';
import { ProviderHomeScreen } from './ProviderHomeScreen';
import { InvitacionAvisos } from '../components/InvitacionAvisos';
import { MainHeader, MainTab } from '../components/MainHeader';
import { useMockStore } from '../context/MockStoreContext';

const roleToTab = (role: string): MainTab => {
  if (role === 'PROVIDER') return 'Proveedor';
  if (role === 'GROUP_OWNER') return 'Mis Grupos';
  return 'Conductor';
};

export function HomeScreen() {
  const { role, setRole } = useMockStore();
  const activeTab = roleToTab(role);

  const handleTabChange = useCallback(
    (tab: MainTab) => {
      if (tab === 'Conductor') setRole('DRIVER');
      if (tab === 'Proveedor') setRole('PROVIDER');
      if (tab === 'Mis Grupos') setRole('GROUP_OWNER');
    },
    [setRole]
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'Conductor':
        return <DriverHomeScreen />;
      case 'Proveedor':
        return <ProviderHomeScreen />;
      case 'Mis Grupos':
        return <MyGroupsScreen />;
      default:
        return <DriverHomeScreen />;
    }
  };

  return (
    <View style={styles.container}>
      <MainHeader activeTab={activeTab} onTabChange={handleTabChange} />
      {/* La primera vez pregunta si quiere avisos (pedido del usuario, 19-09-2026). */}
      <InvitacionAvisos />
      <View style={styles.content}>{renderContent()}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Fondo general del app en blanco (el usuario lo fijó el 18-09-2026).
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
});
