import 'react-native-url-polyfill/auto';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from './src/context/AuthContext';
import { MockStoreProvider } from './src/context/MockStoreContext';
import { ALTURA_VISIBLE, instalarAlturaVisible } from './src/lib/alturaVisible';
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
 *
 * Y no puede ser un 100 % a secas (18-09-2026, iPhone del usuario: "entre la barra para
 * textear y el teclado se generan espacios en blanco"): en iOS Safari el 100 % es el viewport
 * de maquetación (el de las barras plegadas), más alto que lo que se ve, así que el fondo de
 * la app quedaba detrás de la barra de Safari y el teclado no encogía nada. La altura es la
 * variable `--altura-visible`, que `lib/alturaVisible.ts` mantiene al día.
 */
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const estilo = document.createElement('style');
  // `min-height` también: la plantilla de Expo deja `html, body, #root { min-height: 100% }`
  // y con eso la altura de la variable no se aplicaba (medido: con el teclado, la app seguía
  // midiendo 932 px y la barra de escribir quedaba lejos del teclado).
  estilo.textContent = `html, body, #root { height: var(${ALTURA_VISIBLE}, 100%); min-height: var(${ALTURA_VISIBLE}, 100%); }`;
  document.head.appendChild(estilo);
}

export default function App() {
  useEffect(() => {
    initNotifications();
    // Mide el viewport visible para ajustar la altura cuando aparece el teclado.
    return instalarAlturaVisible();
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
