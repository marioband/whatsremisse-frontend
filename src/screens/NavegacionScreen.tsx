import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';

import { InterruptorDeslizante } from '../components/InterruptorDeslizante';
import {
  APPS_DE_NAVEGACION,
  AppDeNavegacion,
  leerAppDeNavegacion,
  guardarAppDeNavegacion,
  nuevaSeleccion,
} from '../lib/navegacion';
import { RootStackParamList } from '../navigation/RootNavigator';
import { IconoDeAtras } from '../components/IconoDeAtras';

type NavegacionNav = StackNavigationProp<RootStackParamList, 'Navegacion'>;

const DARK_BG = '#2D2D2D';
const TEXTO = '#2D2D2D';
const TEXTO_SUAVE = '#6B6B6B';

/**
 * Cuenta → Navegación: con qué app se abren las rutas.
 *
 * El selector es excluyente (como el interruptor del bloqueo de aplicación): al
 * encender una app se apaga la otra y nunca se queda sin ninguna; Waze viene
 * activado por defecto.
 */
export function NavegacionScreen() {
  const navigation = useNavigation<NavegacionNav>();
  const [seleccion, setSeleccion] = useState<AppDeNavegacion>('WAZE');

  // Se lee al abrir la pantalla: la preferencia vive en el dispositivo.
  useEffect(() => {
    let vigente = true;
    leerAppDeNavegacion().then((guardada) => {
      if (vigente) setSeleccion(guardada);
    });
    return () => {
      vigente = false;
    };
  }, []);

  const elegir = (tocada: AppDeNavegacion, encendida: boolean) => {
    const siguiente = nuevaSeleccion(seleccion, tocada, encendida);
    setSeleccion(siguiente);
    guardarAppDeNavegacion(siguiente);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <IconoDeAtras />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Navegación</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.body}>
        <Text style={styles.texto}>Elige con qué app quieres abrir las rutas de tus servicios</Text>

        <View style={styles.opciones}>
          {APPS_DE_NAVEGACION.map((app) => (
            <View key={app.id} style={styles.opcion}>
              <Text style={styles.opcionLabel}>{app.etiqueta}</Text>
              <InterruptorDeslizante
                encendido={seleccion === app.id}
                onCambiar={(encendida) => elegir(app.id, encendida)}
                etiqueta={`Abrir rutas con ${app.etiqueta}`}
              />
            </View>
          ))}
        </View>
      </View>
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
    backgroundColor: DARK_BG,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
    minHeight: 102,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backArrow: {
    color: '#fff',
    fontSize: 24,
  },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 36,
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  texto: {
    fontSize: 15,
    color: TEXTO,
    textAlign: 'center',
    lineHeight: 22,
  },
  opciones: {
    marginTop: 24,
    alignItems: 'center',
  },
  opcion: {
    width: '100%',
    maxWidth: 320,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F5F5',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  opcionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: TEXTO_SUAVE,
  },
});
