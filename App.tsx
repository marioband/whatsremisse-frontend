import 'react-native-url-polyfill/auto';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from './src/context/AuthContext';
import { MockStoreProvider } from './src/context/MockStoreContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { initNotifications } from './src/services/notifications';

export default function App() {
  useEffect(() => {
    initNotifications();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <MockStoreProvider>
            <RootNavigator />
          </MockStoreProvider>
        </AuthProvider>
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
