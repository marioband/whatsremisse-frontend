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
import { LugarGuardado, lugaresParaElCampo, ServicioDelHistorial } from '../lib/lugaresFrecuentes';
import { registrarAhorro } from '../lib/medidor';
import {
  detalleDeDireccion,
  textoDelCampo,
  hayApiDeDirecciones,
  nuevaSesion,
  sugerirDirecciones,
  SugerenciaDireccion,
} from '../lib/places';

const BLUE = '#3F51B5';
const DARK_BG = '#2D2D2D';
const ROJO = '#C2333F';

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
  /**
   * Servicios ya publicados por este usuario: de ahí salen las direcciones que repite
   * (lugares guardados). Es opcional y no cuesta ninguna llamada.
   */
  historial?: readonly ServicioDelHistorial[];
  estilo?: StyleProp<ViewStyle>;
  /** Texto de ayuda bajo el campo (por ejemplo, avisos de coherencia). */
  ayuda?: string;
  /**
   * Avisa cuando las sugerencias se despliegan o se cierran. Lo usa la pantalla para
   * levantar (zIndex) la FILA de este campo: en web, si dos filas comparten capa,
   * gana la de abajo en el documento y el desplegable de la de arriba queda tapado.
   */
  onSugerenciasVisibles?: (visibles: boolean) => void;
  /**
   * Si este campo es el ORIGEN o un DESTINO. Solo cambia el color del punto de cada fila:
   * azul institucional para el origen y oscuro para el destino, los MISMOS puntos que pinta la
   * tarjeta del servicio (regla del usuario, 21-09-2026: «punto azul origen, punto negro destino»).
   */
  punto?: 'origen' | 'destino';
  /**
   * Avisa cuando el campo recibe o pierde el foco. Lo usa Nuevo servicio para esconder el pie
   * (Anular · Guardar · Elegir grupos) mientras se escribe una dirección: con el desplegable de
   * sugerencias abierto esos botones quitaban media pantalla.
   */
  onFoco?: (enfocado: boolean) => void;
}

const ESPERA_MS = 400;

/**
 * Campo de dirección con sugerencias.
 *
 * Al escribir se despliega, debajo del campo, primero **lo que el usuario
 * escribió** (elegible, para quedarse con su propia dirección) y después las
 * sugerencias de la app — que son función Premium. Sin premium el campo sigue
 * funcionando: solo se avisa que las sugerencias requieren la membresía.
 *
 * Antes que todo eso van los **lugares guardados** (24-09-2026): el aeropuerto,
 * con su punto exacto, y las direcciones que este usuario repite. Son locales —
 * no llaman a Google— y aparecen ya al abrir el campo, sin teclear nada.
 */
export function AddressInput({
  valor,
  placeholder,
  premium,
  onChangeText,
  onConfirmar,
  ubicacion,
  historial,
  estilo,
  ayuda,
  onSugerenciasVisibles,
  punto = 'origen',
  onFoco,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [sugerencias, setSugerencias] = useState<SugerenciaDireccion[]>([]);
  const sesion = useRef(nuevaSesion());
  /** El campo, para poder soltarle el teclado al cerrar las sugerencias. */
  const campoDeTexto = useRef<TextInput>(null);
  const ultimaConsulta = useRef<string | null>(null);

  // Cada vez que el usuario elige algo (o se cierra el desplegable) se renueva
  // el token de sesión: así Google cobra una sola unidad por búsqueda elegida.
  const cerrar = () => {
    setAbierto(false);
    setSugerencias([]);
    ultimaConsulta.current = null;
    sesion.current = nuevaSesion();
    // Se suelta el teclado: en la pantalla, el pie (Anular · Guardar · Elegir grupos) está escondido
    // mientras se escribe una dirección, y en el móvil tocar el fondo del formulario NO siempre
    // quita el foco: sin esto el usuario podría quedarse sin esos botones a la vista.
    campoDeTexto.current?.blur();
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

  // Lugares guardados: el aeropuerto (verificado) y las direcciones que este usuario
  // repite. Se calculan en local, sin llamar a Google. Mientras Google busca o ya trajo
  // sugerencias, la lista local no se cuela (regla del usuario, 24-09-2026).
  const lugares = useMemo(
    () =>
      lugaresParaElCampo({
        texto: valor,
        servicios: historial,
        haySugerenciasDeGoogle: cargando || sugerencias.length > 0,
      }),
    [valor, historial, cargando, sugerencias]
  );

  const filas = useMemo(
    () => filasDeSugerencias({ abierto, premium, texto: valor, sugerencias, cargando, lugares }),
    [abierto, premium, valor, sugerencias, cargando, lugares]
  );

  // El desplegable solo ocupa pantalla cuando tiene filas: eso es lo que avisa a la
  // pantalla para levantar esta fila (zIndex) sobre las demás.
  const desplegado = filas.length > 0;
  const avisarRef = useRef(onSugerenciasVisibles);
  useEffect(() => {
    avisarRef.current = onSugerenciasVisibles;
  }, [onSugerenciasVisibles]);

  useEffect(() => {
    avisarRef.current?.(desplegado);
    return () => {
      if (desplegado) avisarRef.current?.(false);
    };
  }, [desplegado]);

  const elegirMiTexto = (texto: string) => {
    onChangeText(texto);
    onConfirmar({ texto, lat: null, lng: null, escritaPorElUsuario: true });
    // Elegir su propia escritura no gasta ninguna llamada: no hay que geocodificar.
    registrarAhorro('texto-del-usuario');
    cerrar();
  };

  /**
   * Elegir un lugar guardado (el aeropuerto, o una dirección que ya usó): el texto y el
   * punto viajan juntos, así que el servicio nace CON coordenadas y no hay que resolver
   * nada — ni gasta una llamada de direcciones.
   */
  const elegirLugarGuardado = (lugar: LugarGuardado) => {
    onChangeText(lugar.texto);
    onConfirmar({
      texto: lugar.texto,
      lat: lugar.lat,
      lng: lugar.lng,
      // Un lugar verificado (con punto) no es «mi escritura»; uno que repite sin punto, sí.
      escritaPorElUsuario: !lugar.exacto,
    });
    registrarAhorro(lugar.exacto ? 'cache' : 'texto-del-usuario');
    cerrar();
  };

  const elegirSugerencia = async (sugerencia: SugerenciaDireccion) => {
    // Se muestra ya el texto elegido; las coordenadas llegan con el detalle.
    onChangeText(sugerencia.texto);
    setAbierto(false);
    const detalle = await detalleDeDireccion(sugerencia.placeId, sesion.current);
    /**
     * Si lo elegido es un lugar CON NOMBRE (un aeropuerto, un centro comercial), el campo se queda
     * con ese nombre —lo que el usuario vio en la lista— y no con la dirección exacta, que antes lo
     * borraba (pedido del usuario, 21-09-2026). Si es una dirección de calle, se queda la dirección
     * exacta, como siempre. Las coordenadas que viajan aparte son las del detalle: la ruta y la
     * distancia no cambian.
     */
    const texto = textoDelCampo({
      nombre: sugerencia.principal || sugerencia.texto,
      direccion: detalle?.texto || sugerencia.texto,
      tipos: detalle?.tipos,
    });
    onChangeText(texto);
    onConfirmar({
      texto,
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
    if (fila.tipo === 'lugar-guardado') {
      const { lugar } = fila;
      return (
        <TouchableOpacity
          key={`lugar-${lugar.texto}`}
          style={[styles.fila, styles.filaGuardada]}
          onPress={() => elegirLugarGuardado(lugar)}
          activeOpacity={0.7}
        >
          <View
            style={[styles.punto, punto === 'destino' ? styles.puntoDestino : styles.puntoOrigen]}
          />
          <View style={styles.filaTextos}>
            <Text style={styles.filaTitulo} numberOfLines={2}>
              {lugar.texto}
            </Text>
            <Text style={styles.filaSubtitulo} numberOfLines={1}>
              {lugar.exacto ? `${lugar.detalle} · punto exacto` : lugar.detalle}
            </Text>
          </View>
        </TouchableOpacity>
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
        <View
          style={[styles.punto, punto === 'destino' ? styles.puntoDestino : styles.puntoOrigen]}
        />
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
          ref={campoDeTexto}
          style={styles.entrada}
          placeholder={placeholder}
          placeholderTextColor="#999"
          value={valor}
          onChangeText={(texto) => {
            onChangeText(texto);
            setAbierto(true);
          }}
          onFocus={() => {
            setAbierto(true);
            onFoco?.(true);
          }}
          // Al perder el foco NO se cierran las sugerencias: en web el toque en una sugerencia
          // dispara antes el `blur`, y cerrarlas ahí haría imposible elegir una.
          onBlur={() => onFoco?.(false)}
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
    // Cada campo con sugerencias levanta su propia "capa" (zIndex) DENTRO de su fila.
    // La capa que decide contra las filas vecinas es la de la fila (ver
    // src/lib/desplegables.ts): si dos filas comparten zIndex, el desplegable de la
    // de arriba queda tapado por el campo de abajo.
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
  /** Lugares guardados (aeropuerto, direcciones que repite): azul institucional rebajado. */
  filaGuardada: {
    backgroundColor: '#EDF0FA',
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
  /** El punto de la dirección: azul en el origen, oscuro en el destino (igual que la tarjeta). */
  punto: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  puntoOrigen: {
    backgroundColor: BLUE,
  },
  puntoDestino: {
    backgroundColor: DARK_BG,
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
