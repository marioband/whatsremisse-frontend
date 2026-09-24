import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActualizacion } from '../hooks/useActualizacion';
import { lineaDeVersion } from '../lib/actualizacion';
import { AZUL, OSCURO, TEXTO_SUAVE } from '../lib/colors';

/**
 * El aviso de actualización (pedido del usuario, 24-09-2026: «los usuarios deberían saber que hay
 * actualización pendiente y no deberían poder usar la app sin actualizar»).
 *
 * Dos piezas, con la regla que eligió el usuario:
 *   - `BloqueoDeActualizacion`: pantalla completa, sin escapatoria, cuando la app se abre o se
 *     reanuda con una versión vieja (o cuando el despliegue está marcado como urgente). Se sale
 *     actualizando.
 *   - `BandaDeActualizacion`: franja abajo, discreta, mientras la usa; se puede apartar con «Ahora
 *     no» (el bloqueo vuelve la próxima vez que reanude, así que no se queda con la vieja).
 *
 * Se monta UNA vez en `App.tsx`, encima de todo lo demás.
 */
export function AvisoDeActualizacion() {
  const { versionActual, versionNueva, bloqueo, banda, ocultarBanda, actualizar } =
    useActualizacion();

  if (!versionNueva) return null;

  if (bloqueo) {
    return (
      <BloqueoDeActualizacion
        versionActual={lineaDeVersion(versionActual)}
        versionNueva={lineaDeVersion(versionNueva)}
        urgente={versionNueva.urgente === true}
        onActualizar={actualizar}
      />
    );
  }

  if (banda) {
    return <BandaDeActualizacion onActualizar={actualizar} onOcultar={ocultarBanda} />;
  }

  return null;
}

interface PropsDelBloqueo {
  versionActual: string;
  versionNueva: string;
  urgente: boolean;
  onActualizar: () => void;
}

/** Pantalla completa: mientras esté, la app no se puede usar. */
export function BloqueoDeActualizacion({
  versionActual,
  versionNueva,
  urgente,
  onActualizar,
}: PropsDelBloqueo) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.bloqueo, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
      accessibilityViewIsModal
      accessibilityLabel="Actualización necesaria"
    >
      <Text style={styles.titulo}>
        {urgente ? 'Actualización urgente' : 'Hay una versión nueva'}
      </Text>
      <Text style={styles.explicacion}>
        {urgente
          ? 'Esta versión tiene algo que hay que corregir ya. Actualiza para seguir trabajando.'
          : 'Para seguir trabajando necesitas la última versión: la que tienes en este teléfono ya no está al día.'}
      </Text>

      <TouchableOpacity
        style={styles.botonAzul}
        onPress={onActualizar}
        accessibilityRole="button"
        accessibilityLabel="Actualizar ahora"
      >
        <Text style={styles.botonAzulTexto}>Actualizar ahora</Text>
      </TouchableOpacity>

      <Text style={styles.versiones}>
        Tienes la {versionActual}
        {'\n'}La última es la {versionNueva}
      </Text>
    </View>
  );
}

/** Franja de abajo, mientras la app está en uso. */
export function BandaDeActualizacion({
  onActualizar,
  onOcultar,
}: {
  onActualizar: () => void;
  onOcultar: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.banda, { paddingBottom: 10 + insets.bottom }]}
      accessibilityLabel="Hay una actualización disponible"
    >
      <Text style={styles.bandaTexto}>Hay una versión nueva de la app.</Text>
      <TouchableOpacity
        style={styles.bandaBoton}
        onPress={onActualizar}
        accessibilityRole="button"
        accessibilityLabel="Actualizar"
      >
        <Text style={styles.bandaBotonTexto}>Actualizar</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onOcultar}
        style={styles.bandaCerrar}
        accessibilityRole="button"
        accessibilityLabel="Ahora no"
      >
        <Text style={styles.bandaCerrarTexto}>Ahora no</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bloqueo: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  titulo: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111',
    textAlign: 'center',
    marginBottom: 12,
  },
  explicacion: {
    fontSize: 15,
    lineHeight: 22,
    color: TEXTO_SUAVE,
    textAlign: 'center',
    marginBottom: 28,
  },
  botonAzul: {
    backgroundColor: AZUL,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  botonAzulTexto: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  versiones: {
    marginTop: 18,
    fontSize: 12,
    color: TEXTO_SUAVE,
    textAlign: 'center',
    lineHeight: 18,
  },
  banda: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9998,
    elevation: 9998,
    backgroundColor: OSCURO,
    paddingTop: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bandaTexto: { flex: 1, color: '#FFFFFF', fontSize: 14 },
  bandaBoton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginLeft: 10,
  },
  bandaBotonTexto: { color: OSCURO, fontSize: 13, fontWeight: 'bold' },
  bandaCerrar: { marginLeft: 12 },
  bandaCerrarTexto: { color: '#CCCCCC', fontSize: 13, fontWeight: '600' },
});
