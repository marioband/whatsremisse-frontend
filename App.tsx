import 'react-native-url-polyfill/auto';
import { StatusBar } from 'expo-status-bar';

import { OSCURO } from './src/lib/colors';
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
/**
 * Color con el que el sistema pinta su BARRA DE ESTADO en iOS.
 *
 * Desde iOS 26 Apple **ignora** `theme-color` (y también el meta de siempre,
 * `apple-mobile-web-app-status-bar-style`, que en iOS 27 ya no se respeta): el color de la barra
 * lo saca del **fondo del documento** (`html`/`body`) o del de un elemento **fijo** pegado arriba.
 * Con el documento en blanco, la barra salía blanca sobre nuestra cabecera oscura — la "franja
 * blanca difuminada" que reportó el usuario desde su iPhone con iOS 27 (19-09-2026).
 *
 * Se pone el mismo negro institucional de las cabeceras (`#2D2D2D`): así la barra del sistema y
 * la cabecera son la misma pieza. Se declara de las DOS formas que documenta Apple (fondo del
 * documento y elemento fijo) porque no se puede probar aquí cuál usa cada versión de iOS.
 */
const COLOR_DE_LA_BARRA_DE_ESTADO = '#2D2D2D';

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const estilo = document.createElement('style');
  // `min-height` también: la plantilla de Expo deja `html, body, #root { min-height: 100% }`
  // y con eso la altura de la variable no se aplicaba (medido: con el teclado, la app seguía
  // midiendo 932 px y la barra de escribir quedaba lejos del teclado).
  estilo.textContent = `
    html, body, #root { height: var(${ALTURA_VISIBLE}, 100%); min-height: var(${ALTURA_VISIBLE}, 100%); }
    html, body { background-color: ${COLOR_DE_LA_BARRA_DE_ESTADO}; }
    /* Elemento FIJO pegado al borde superior: es lo que iOS mira para el color de su barra.
       Va detrás del contenido (z-index -1) y no recibe toques: no se ve ni estorba. */
    /* En el iPhone, mantener pulsado un texto abre el menú del sistema (seleccionar, copiar)
       y se come la pulsación larga de la app. Las filas de mensaje van marcadas con el
       atributo data-mensaje desde MessageList y GroupChatScreen (regla del usuario,
       19-09-2026: el menú de eliminar sale manteniendo pulsado). */
    /* El botón del micrófono se queda el gesto de mantener pulsado: sin esto, al mover el dedo
       el navegador entiende que se está desplazando la página, manda pointercancel y la
       grabación se cancelaba sola (medido en el banco). */
    [data-micro] {
      touch-action: none;
      -webkit-user-select: none;
      user-select: none;
    }
    [data-mensaje] {
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
    }
    #franja-del-sistema {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background-color: ${COLOR_DE_LA_BARRA_DE_ESTADO};
      z-index: -1;
      pointer-events: none;
    }
  `;
  document.head.appendChild(estilo);
  const franja = document.createElement('div');
  franja.id = 'franja-del-sistema';
  document.body.appendChild(franja);
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
        <StatusBar
          // En Android el color de la barra de estado lo pinta la app: con `auto` no siempre
          // coincide con el negro institucional de la cabecera (reporte del usuario, 19-09-2026).
          // `light` = iconos blancos, que es lo que pide un fondo oscuro.
          style="light"
          backgroundColor={OSCURO}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
