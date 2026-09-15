import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
} from 'react-native';

import { convieneBuscar, filasDeSugerencias, FilaSugerencia } from '../lib/addressSuggestions';
import { registrarAhorro } from '../lib/medidor';
import {
  detalleDeDireccion,
  hayApiDeDirecciones,
  nuevaSesion,
  sugerirDirecciones,
  SugerenciaDireccion,
} from '../lib/places';

const BLUE = '#3F51B5';
const DARK_BG = '#2D2D2D';
const ROJO = '#B00020';

export interface DireccionConfirmada {
  texto: string;
  lat: number | null;
  lng: number | null;
  /** true cuando el usuario eligió su propia escritura (sin sugerencia). */
  escritaPorElUsuario: boolean;
}

interface Props {
  valor: string;
  placeholder?: string;
  /** Si es false, el campo funciona igual pero sin sugerencias (plan gratuito). */
  premium: boolean;
  onChangeText: (texto: string) => void;
  /** Se llama al confirmar: su propia escritura o una sugerencia elegida. */
  onConfirmar: (direccion: DireccionConfirmada) => void;
  /** Posición del usuario para priorizar sugerencias cercanas. */
  ubicacion?: { lat: number; lng: number } | null;
  estilo?: StyleProp<ViewStyle>;
  /** Texto de ayuda bajo el campo (por ejemplo, avisos de coherencia). */
  ayuda?: string;
}

const ESPERA_MS = 400;

/**
 * Campo de dirección con sugerencias.
 *
 * Al escribir se despliega, debajo del campo, primero **lo que el usuario
 * escribió** (elegible, para quedarse con su propia dirección) y después las
 * sugerencias de la app — que son función Premium. Sin premium el campo sigue
 * funcionando: solo se avisa que las sugerencias requieren la membresía.
 */
export function AddressInput({
  valor,
  placeholder,
  premium,
  onChangeText,
  onConfirmar,
  ubicacion,
  estilo,
  ayuda,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [sugerencias, setSugerencias] = useState<SugerenciaDireccion[]>([]);
  const sesion = useRef(nuevaSesion());
  const ultimaConsulta = useRef<string | null>(null);

  // Cada vez que el usuario elige algo (o se cierra el desplegable) se renueva
  // el token de sesión: así Google cobra una sola unidad por búsqueda elegida.
  const cerrar = () => {
    setAbierto(false);
    setSugerencias([]);
    ultimaConsulta.current = null;
    sesion.current = nuevaSesion();
  };

  useEffect(() => {
    if (!abierto || !premium) return;
    const texto = valor.trim();
    if (!convieneBuscar(premium, texto, ultimaConsulta.current, sugerencias)) return;

    let vigente = true;
    setCargando(true);
    const temporizador = setTimeout(() => {
      ultimaConsulta.current = texto;
      sugerirDirecciones(texto, sesion.current, ubicacion)
        .then((resultado) => {
          if (vigente) setSugerencias(resultado);
        })
        .finally(() => {
          if (vigente) setCargando(false);
        });
    }, ESPERA_MS);

    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, abierto, premium]);

  const filas = useMemo(
    () => filasDeSugerencias({ abierto, premium, texto: valor, sugerencias, cargando }),
    [abierto, premium, valor, sugerencias, cargando]
  );

  const elegirMiTexto = (texto: string) => {
    onChangeText(texto);
    onConfirmar({ texto, lat: null, lng: null, escritaPorElUsuario: true });
    // Elegir su propia escritura no gasta ninguna llamada: no hay que geocodificar.
    registrarAhorro('texto-del-usuario');
    cerrar();
  };

  const elegirSugerencia = async (sugerencia: SugerenciaDireccion) => {
    // Se muestra ya el texto elegido; las coordenadas llegan con el detalle.
    onChangeText(sugerencia.texto);
    setAbierto(false);
    const detalle = await detalleDeDireccion(sugerencia.placeId, sesion.current);
    onConfirmar({
      texto: detalle?.texto || sugerencia.texto,
      lat: detalle?.lat ?? null,
      lng: detalle?.lng ?? null,
      escritaPorElUsuario: false,
    });
    cerrar();
  };

  const renderFila = (fila: FilaSugerencia, indice: number) => {
    if (fila.tipo === 'cargando') {
      return (
        <View key="cargando" style={styles.fila}>
          <Text style={styles.filaSubtitulo}>Buscando direcciones…</Text>
        </View>
      );
    }
    if (fila.tipo === 'premium-bloqueado') {
      return (
        <View key="premium" style={[styles.fila, styles.filaBloqueada]}>
          <Text style={styles.candado}>🔒</Text>
          <View style={styles.filaTextos}>
            <Text style={styles.filaTitulo}>{fila.titulo}</Text>
            <Text style={styles.filaSubtitulo}>{fila.subtitulo}</Text>
          </View>
        </View>
      );
    }
    if (fila.tipo === 'mi-texto') {
      return (
        <TouchableOpacity
          key="mi-texto"
          style={[styles.fila, styles.filaMiTexto]}
          onPress={() => elegirMiTexto(fila.texto)}
          activeOpacity={0.7}
        >
          <Text style={styles.iconoMiTexto}>✎</Text>
          <View style={styles.filaTextos}>
            <Text style={styles.filaTituloMiTexto} numberOfLines={2}>
              {fila.titulo}
            </Text>
            <Text style={styles.filaSubtitulo}>{fila.subtitulo}</Text>
          </View>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity
        key={`${fila.sugerencia.placeId}-${indice}`}
        style={styles.fila}
        onPress={() => elegirSugerencia(fila.sugerencia)}
        activeOpacity={0.7}
      >
        <Text style={styles.icono}>📍</Text>
        <View style={styles.filaTextos}>
          <Text style={styles.filaTitulo} numberOfLines={1}>
            {fila.sugerencia.principal}
          </Text>
          {!!fila.sugerencia.secundario && (
            <Text style={styles.filaSubtitulo} numberOfLines={1}>
              {fila.sugerencia.secundario}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.contenedor, estilo]}>
      <View style={styles.campo}>
        <TextInput
          style={styles.entrada}
          placeholder={placeholder}
          placeholderTextColor="#999"
          value={valor}
          onChangeText={(texto) => {
            onChangeText(texto);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
        />
        {valor.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              onChangeText('');
              cerrar();
            }}
            style={styles.limpiar}
          >
            <Text style={styles.limpiarTexto}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {!!ayuda && <Text style={styles.ayuda}>{ayuda}</Text>}

      {filas.length > 0 && (
        <View style={styles.desplegable}>
          {filas.map((fila, indice) => renderFila(fila, indice))}
          <TouchableOpacity style={styles.cerrarBtn} onPress={cerrar} activeOpacity={0.7}>
            <Text style={styles.cerrarTexto}>Ocultar sugerencias</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

/** Aviso de que las sugerencias necesitan la membresía (se usa en la pantalla). */
export function necesitaPremium(): boolean {
  return !hayApiDeDirecciones();
}

const styles = StyleSheet.create({
  contenedor: {
    // Cada campo con sugerencias levanta su propia "capa" (zIndex) para que el
    // desplegable quede por encima de los campos que vienen después (tarifa,
    // fecha, hora...) y no tapado por ellos.
    position: 'relative',
    zIndex: 1000,
  },
  campo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingRight: 8,
  },
  entrada: {
    flex: 1,
    padding: 14,
    fontSize: 15,
    color: '#333',
  },
  limpiar: {
    padding: 8,
  },
  limpiarTexto: {
    color: '#999',
    fontSize: 15,
    fontWeight: '700',
  },
  ayuda: {
    fontSize: 12,
    color: ROJO,
    marginTop: 6,
  },
  desplegable: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    zIndex: 1001,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E2E2',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  lista: {
    // Sin lista con scroll propio: en web un ScrollView dentro de una caja
    // absoluta se recorta justo donde empieza el campo siguiente y las
    // sugerencias parecen "tapadas". Se muestran todas las filas.
    maxHeight: 320,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#EEE',
  },
  filaMiTexto: {
    backgroundColor: '#F4F6FD',
  },
  filaBloqueada: {
    backgroundColor: '#FAFAFA',
  },
  filaTextos: {
    flex: 1,
    marginLeft: 8,
  },
  filaTitulo: {
    fontSize: 14,
    color: '#222',
  },
  filaTituloMiTexto: {
    fontSize: 14,
    color: BLUE,
    fontWeight: '700',
  },
  filaSubtitulo: {
    fontSize: 12,
    color: '#777',
    marginTop: 2,
  },
  icono: {
    fontSize: 14,
  },
  iconoMiTexto: {
    fontSize: 15,
    color: BLUE,
    fontWeight: '700',
  },
  candado: {
    fontSize: 14,
  },
  cerrarBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#F7F7F7',
  },
  cerrarTexto: {
    fontSize: 12,
    fontWeight: '700',
    color: DARK_BG,
  },
});
