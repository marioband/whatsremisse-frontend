import 'react-native-url-polyfill/auto';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from './src/context/AuthContext';
import { MockStoreProvider } from './src/context/MockStoreContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { initNotifications } from './src/services/notifications';

/**
 * En web, la plantilla de Expo deja el documento con `min-height: 100%`: el
 * documento crece con el contenido y lo que se desplaza es la PÁGINA entera. Con
 * eso, todo lo posicionado como `position: absolute; bottom: …` se ancla al final
 * del contenido y no de la pantalla: el usuario reportó que el botón flotante "+"
 * del apartado Proveedor/Todos aparecía al final de la lista en vez de quedarse
 * flotando (medido: 1461 px por debajo del borde de la pantalla).
 *
 * Se fija la altura del documento al viewport, como en el móvil: el que se desplaza
 * es cada lista, no la página. Va aquí, dentro de src/, para que entre por Fast
 * Refresh sin tocar la plantilla HTML ni reiniciar el servidor.
 */
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const estilo = document.createElement('style');
  estilo.textContent = 'html, body, #root { height: 100%; }';
  document.head.appendChild(estilo);
}

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
