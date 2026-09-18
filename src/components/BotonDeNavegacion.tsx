import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, Linking, Platform, View } from 'react-native';

import { Alert } from '../lib/alert';
import { AZUL } from '../lib/colors';
import {
  APP_DE_NAVEGACION_POR_DEFECTO,
  AppDeNavegacion,
  etiquetaDelBoton,
  guardarParadasDeNavegacion,
  indiceDelBoton,
  indiceSiguiente,
  leerAppDeNavegacion,
  leerParadasDeNavegacion,
  marcaDeParada,
  marcarChatDeVuelta,
  marcarParada,
  paradasDelServicio,
  urlDeNavegacion,
  viajeReportadoComoUbicado,
} from '../lib/navegacion';
import { ServiceAlert } from '../types';

/**
 * Botón de navegación del conductor (pie de la tarjeta del chat).
 *
 * Lleva al conductor a la ruta del viaje: al ORIGEN mientras el viaje no esté reportado
 * y, desde que desliza "Ubicado", al destino (o a "Ir a Destino 1", "Ir a Destino 2"… si
 * hay paradas), sin tener que pulsar antes "Ir a origen" — regla del usuario del
 * 18-09-2026. A partir de ahí cada pulsación avanza por las paradas y, tras la última,
 * vuelve al origen.
 *
 * La ruta se abre con la app que el usuario eligió en Cuenta → Navegación (Waze por
 * defecto) y en OTRA pestaña, así que la app no se descarga. Como al volver el navegador
 * del teléfono sí puede recargarla, antes de abrir la ruta se deja una marca para que la
 * pantalla de inicio devuelva al conductor a este mismo chat.
 */
export function BotonDeNavegacion({
  service,
  conductor,
}: {
  service: ServiceAlert;
  conductor: string;
}) {
  const paradas = useMemo(() => paradasDelServicio(service), [service]);
  const [marca, setMarca] = useState<number | null>(null);
  const [app, setApp] = useState<AppDeNavegacion>(APP_DE_NAVEGACION_POR_DEFECTO);

  // Preferencia de app y parada guardada: se leen al abrir la tarjeta.
  useEffect(() => {
    let vigente = true;
    Promise.all([leerAppDeNavegacion(), leerParadasDeNavegacion()]).then(([appElegida, marcas]) => {
      if (!vigente) return;
      setApp(appElegida);
      setMarca(marcaDeParada(marcas, service.id, conductor));
    });
    return () => {
      vigente = false;
    };
  }, [service.id, conductor]);

  // El reporte manda sobre las pulsaciones: sin "Ubicado" el botón ofrece el origen.
  const reportado = viajeReportadoComoUbicado(service);
  const indiceActual = indiceDelBoton(paradas, reportado, marca);

  const alPulsar = async () => {
    const parada = paradas[indiceActual];
    if (!parada) return;
    const url = urlDeNavegacion(app, parada);

    // Por si el navegador recarga la app al volver de Waze: que vuelva a este chat.
    await marcarChatDeVuelta(service.id);

    try {
      // En el navegador del TELÉFONO la ruta se abre en la MISMA pestaña.
      //
      // `Linking.openURL` en web es `window.open(url, target, 'noopener')` (así lo
      // implementa react-native-web): una pestaña NUEVA. En el iPhone eso deja una pestaña
      // encima, con su X para cerrarla, y al volver Safari ya había descargado la de la
      // app ("aparece el app pero reiniciada", reporte del usuario del 18-09-2026). Con
      // `location.assign`, iOS entrega el enlace al Waze instalado y la página de la app se
      // queda donde estaba.
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        // MEDIDO en el banco (18-09-2026): al pulsar, la pestaña de la app Navega a la URL
        // del mapa en la MISMA pestaña (cero pestañas nuevas: lo confirma la lista de
        // objetivos del navegador). Si el Waze instalado la toma, la página se queda como
        // estaba. Si NO está instalado, el navegador se queda en la web del mapa.
        //
        // Aquí NO se puede dejar un temporizador que "vuelva solo": el navegador cancela
        // todo el JavaScript de la página al navegar, así que el temporizador muere con
        // ella (se probó y no volvía). La vuelta la atiende la app al regresar —el botón
        // atrás de Safari dispara `pageshow`/`visibilitychange` y el hook de la vuelta
        // relee los datos y vuelve a levantar los canales—, que es lo que sí sobrevive.
        window.location.assign(url);
        return;
      }
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

    // Mientras el viaje no esté reportado, pulsar NO pasa al destino: eso lo decide el
    // reporte del conductor, no la pulsación.
    if (!reportado) return;

    const siguiente = indiceSiguiente(paradas, indiceActual);
    setMarca(siguiente);
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
