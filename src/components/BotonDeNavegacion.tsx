import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, Linking, View } from 'react-native';

import { Alert } from '../lib/alert';
import { AZUL } from '../lib/colors';
import {
  APP_DE_NAVEGACION_POR_DEFECTO,
  AppDeNavegacion,
  etiquetaDelBoton,
  guardarParadasDeNavegacion,
  indiceGuardado,
  indiceSiguiente,
  leerAppDeNavegacion,
  leerParadasDeNavegacion,
  marcarParada,
  paradasDelServicio,
  urlDeNavegacion,
} from '../lib/navegacion';
import { ServiceAlert } from '../types';

/**
 * Botón de navegación del conductor (pie de la tarjeta del chat).
 *
 * Lleva al conductor a la ruta del viaje: primero al ORIGEN y después a cada
 * destino, en orden. El texto cambia en cada pulsación —"Ir a origen" → "Ir a
 * destino" (un solo destino) o "Ir a Destino 1", "Ir a Destino 2"… (varios)— y
 * después del último destino vuelve a empezar por el origen.
 *
 * La ruta se abre con la app que el usuario eligió en Cuenta → Navegación (Waze por
 * defecto). La parada en la que se quedó se guarda en el dispositivo, para que
 * recargar la app no devuelva el botón al origen.
 */
export function BotonDeNavegacion({
  service,
  conductor,
}: {
  service: ServiceAlert;
  conductor: string;
}) {
  const paradas = useMemo(() => paradasDelServicio(service), [service]);
  const [indice, setIndice] = useState(0);
  const [app, setApp] = useState<AppDeNavegacion>(APP_DE_NAVEGACION_POR_DEFECTO);

  // Preferencia de app y parada guardada: se leen al abrir la tarjeta.
  useEffect(() => {
    let vigente = true;
    Promise.all([leerAppDeNavegacion(), leerParadasDeNavegacion()]).then(([appElegida, marcas]) => {
      if (!vigente) return;
      setApp(appElegida);
      setIndice(indiceGuardado(marcas, service.id, conductor));
    });
    return () => {
      vigente = false;
    };
  }, [service.id, conductor]);

  const indiceActual = Math.min(indice, Math.max(paradas.length - 1, 0));

  const alPulsar = async () => {
    const parada = paradas[indiceActual];
    if (!parada) return;
    const url = urlDeNavegacion(app, parada);

    try {
      await Linking.openURL(url);
    } catch {
      // Sin app que atienda el enlace (o navegador que lo bloquea): se dice, no se
      // deja el botón mudo.
      Alert.alert(
        'No se pudo abrir la ruta',
        `El dispositivo no pudo abrir el enlace de navegación. Puedes copiarlo:\n${url}`,
        [{ text: 'Aceptar' }]
      );
      return;
    }

    const siguiente = indiceSiguiente(paradas, indiceActual);
    setIndice(siguiente);
    const marcas = await leerParadasDeNavegacion();
    await guardarParadasDeNavegacion(marcarParada(marcas, service.id, conductor, siguiente));
  };

  return (
    <View style={styles.contenedor}>
      <TouchableOpacity style={styles.boton} onPress={alPulsar} activeOpacity={0.85}>
        <Text style={styles.texto}>{etiquetaDelBoton(paradas, indiceActual)}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Pie de la tarjeta: el botón va centrado (pedido del usuario). */
  contenedor: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 12,
  },
  boton: {
    backgroundColor: AZUL,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 28,
    minWidth: 180,
    alignItems: 'center',
  },
  texto: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
