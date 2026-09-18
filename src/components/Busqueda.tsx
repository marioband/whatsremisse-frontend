/**
 * La lupa y su campo de búsqueda, en un solo sitio.
 *
 * El usuario pidió la lupa en cinco apartados (18-09-2026: Disponibles y En proceso del
 * conductor, Publicados y En proceso del proveedor, y Mis grupos) y que **cada una busque
 * en el campo donde está**: el botón y la píldora son los mismos en todas para que se
 * comporten y se vean igual (el patrón que ya usaba Postulantes: el mismo botón abre el
 * campo y lo cierra, y cuando está abierto pasa a ✕).
 *
 * El filtro no vive aquí: el texto se compara con `lib/busqueda.ts` y la pantalla decide
 * en qué campos mira.
 */
import React from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
  Platform,
} from 'react-native';

import { Icono, ICONO_BUSCAR } from './Icono';
import { FONDO_TARJETA, TEXTO, TEXTO_SUAVE, TEXTO_TENUE } from '../lib/colors';

interface BotonDeBusquedaProps {
  /** Con la búsqueda abierta el botón cierra (✕) en vez de abrir. */
  abierto: boolean;
  onPress: () => void;
  /** Color de la lupa y del ✕ (las barras claras van en gris, las oscuras en blanco). */
  color?: string;
  /** Lado de la lupa en píxeles. */
  tamano?: number;
  estilo?: StyleProp<ViewStyle>;
  /** Qué anuncia el lector de pantalla (por defecto, "Buscar"). */
  etiqueta?: string;
}

export function BotonDeBusqueda({
  abierto,
  onPress,
  color = TEXTO_SUAVE,
  tamano = 20,
  estilo,
  etiqueta = 'Buscar',
}: BotonDeBusquedaProps) {
  return (
    <TouchableOpacity
      style={estilo}
      onPress={onPress}
      accessibilityLabel={abierto ? 'Cerrar la búsqueda' : etiqueta}
    >
      {abierto ? (
        <Text style={[styles.cerrar, { color, fontSize: tamano }]}>✕</Text>
      ) : (
        <Icono fuente={ICONO_BUSCAR} tamano={tamano} color={color} />
      )}
    </TouchableOpacity>
  );
}

interface BarraDeBusquedaProps {
  consulta: string;
  onCambiarConsulta: (texto: string) => void;
  /** Qué se puede escribir (lo que anuncia el campo vacío). */
  placeholder: string;
  autoFocus?: boolean;
  estilo?: StyleProp<ViewStyle>;
}

/** La píldora con la lupa y el campo, como la de Postulantes y Añadir participante. */
export function BarraDeBusqueda({
  consulta,
  onCambiarConsulta,
  placeholder,
  autoFocus = true,
  estilo,
}: BarraDeBusquedaProps) {
  return (
    <View style={[styles.contenedor, estilo]}>
      <View style={styles.pildora}>
        <Icono fuente={ICONO_BUSCAR} tamano={18} color={TEXTO_SUAVE} estilo={styles.lupa} />
        <TextInput
          style={styles.campo}
          value={consulta}
          onChangeText={onCambiarConsulta}
          placeholder={placeholder}
          placeholderTextColor={TEXTO_TENUE}
          autoFocus={autoFocus}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cerrar: {
    textAlign: 'center',
  },
  contenedor: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: '#fff',
  },
  pildora: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: FONDO_TARJETA,
    borderRadius: 20,
    paddingHorizontal: 14,
    height: 40,
  },
  lupa: {
    marginRight: 8,
  },
  campo: {
    flex: 1,
    fontSize: 14,
    color: TEXTO,
    paddingVertical: 0,
    // En web el navegador dibuja su recuadro de foco (outline) en los campos: la app no
    // lo quiere (misma regla que la barra del chat y la lupa de la cabecera). En nativo
    // no existe.
    ...Platform.select({ web: { outlineStyle: 'none' } as object }),
  },
});
