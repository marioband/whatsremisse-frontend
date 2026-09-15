import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';

import {
  conHora,
  esCombinacionValida,
  formatearHora,
  horaCoherente,
  indiceMasCercano,
  inicioDelDia,
  Meridiano,
  mismoDia,
  normalizarSeleccion,
  opcionesHoras,
  opcionesMinutos,
  ORDEN_HORAS_12,
  parteDeHora,
  primerInstanteValido,
  SeleccionHora,
} from '../lib/datetime';

const DARK_BG = '#2D2D2D';
const BLUE = '#3F51B5';
const GRIS_TEXTO = '#8A8A8A';
const GRIS_DESHABILITADO = '#C4C4C4';

/** Alto de cada fila del carrusel y filas visibles a cada lado. */
const ALTO_ITEM = 44;
const LADO = 2;

interface Props {
  visible: boolean;
  /** Día elegido: la coherencia depende de él (hoy no admite horas pasadas). */
  fecha: Date;
  valor: Date;
  onConfirmar: (fecha: Date) => void;
  onCancelar: () => void;
}

interface WheelProps {
  items: (string | number)[];
  indice: number;
  onIndice: (indice: number) => void;
  esValido: (indice: number) => boolean;
  etiqueta: string;
}

/**
 * Una columna del carrusel: la fila que queda centrada es la elegida. El índice
 * se calcula desde el desplazamiento, así funciona igual con la rueda del ratón
 * (web) que con el arrastre (móvil), sin depender de onMomentumScrollEnd.
 *
 * Las filas que no se pueden elegir (hora ya pasada) se ven deshabilitadas y no
 * responden al toque; si el desplazamiento termina en una, el padre la corrige y
 * la columna se recentra sola (por eso el efecto que sigue al índice).
 */
function Wheel({ items, indice, onIndice, esValido, etiqueta }: WheelProps) {
  const scrollRef = useRef<ScrollView>(null);
  const ultimo = useRef(indice);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: indice * ALTO_ITEM, animated: false });
    ultimo.current = indice;
    // Solo al montar: después manda el desplazamiento del usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si el índice cambia desde fuera (corrección de coherencia), se recentra.
  useEffect(() => {
    if (indice !== ultimo.current) {
      ultimo.current = indice;
      scrollRef.current?.scrollTo({ y: indice * ALTO_ITEM, animated: true });
    }
  }, [indice]);

  const alDesplazar = (evento: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = evento.nativeEvent.contentOffset.y;
    const cercano = Math.max(0, Math.min(items.length - 1, Math.round(y / ALTO_ITEM)));
    if (cercano !== ultimo.current) {
      ultimo.current = cercano;
      onIndice(cercano);
    }
  };

  return (
    <View style={styles.wheelColumn} accessibilityLabel={etiqueta}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ALTO_ITEM}
        decelerationRate="fast"
        contentContainerStyle={styles.wheelContent}
        onScroll={alDesplazar}
        scrollEventThrottle={16}
      >
        {items.map((item, posicion) => {
          const distancia = Math.abs(posicion - indice);
          const seleccionado = distancia === 0;
          const habilitado = esValido(posicion);
          return (
            <TouchableOpacity
              key={`${item}-${posicion}`}
              style={styles.wheelItem}
              activeOpacity={habilitado ? 0.8 : 1}
              disabled={!habilitado}
              onPress={() => onIndice(posicion)}
            >
              <Text
                style={[
                  styles.wheelText,
                  seleccionado && styles.wheelTextActive,
                  !habilitado && styles.wheelTextDisabled,
                  {
                    opacity: !habilitado
                      ? 0.4
                      : seleccionado
                        ? 1
                        : Math.max(0.3, 1 - 0.32 * distancia),
                  },
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

/**
 * Carrusel de hora y minutos con a.m./p.m. La fila centrada queda resaltada con
 * una banda, como en la referencia de diseño.
 *
 * Bloqueo de coherencia: si el día elegido es HOY, no se pueden seleccionar
 * horas que ya pasaron (a las 11:15 a.m. no se puede elegir 11:00 a.m.). Las
 * filas imposibles quedan deshabilitadas y cualquier elección se normaliza a la
 * primera hora válida.
 */
export function TimeWheelPicker({ visible, fecha, valor, onConfirmar, onCancelar }: Props) {
  const horas = useMemo(() => opcionesHoras(), []);
  const minutos = useMemo(() => opcionesMinutos(), []);

  // Se recalcula en cada render: si la pantalla se queda abierta, "ahora" avanza.
  const ahora = new Date();

  const [seleccion, setSeleccion] = useState<SeleccionHora>(() => parteDeHora(valor));
  const [clave, setClave] = useState(0);

  // Al abrirse, el carrusel se coloca en la hora elegida (o en la primera válida).
  useEffect(() => {
    if (!visible) return;
    const ajustada = normalizarSeleccion(fecha, parteDeHora(valor), ahora);
    setSeleccion(ajustada);
    // Fuerza el remontaje de las columnas para que se recolquen en su sitio.
    setClave((actual) => actual + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, fecha, valor]);

  /** Cualquier cambio pasa por aquí: la selección nunca queda en el pasado. */
  const cambiar = (parcial: Partial<SeleccionHora>) => {
    setSeleccion((actual) => normalizarSeleccion(fecha, { ...actual, ...parcial }, ahora));
  };

  const indiceHora = indiceMasCercano(horas, seleccion.hora12);
  const indiceMinuto = indiceMasCercano(minutos, seleccion.minutos);
  const indiceMeridiano = seleccion.meridiano === 'a.m.' ? 0 : 1;

  const horaEsValida = (posicion: number) =>
    minutos.some((m) =>
      esCombinacionValida(
        fecha,
        { hora12: horas[posicion], minutos: m, meridiano: seleccion.meridiano },
        ahora
      )
    );

  const minutoEsValido = (posicion: number) =>
    esCombinacionValida(
      fecha,
      { hora12: seleccion.hora12, minutos: minutos[posicion], meridiano: seleccion.meridiano },
      ahora
    );

  const meridianoEsValido = (posicion: number) => {
    const meridiano: Meridiano = posicion === 0 ? 'a.m.' : 'p.m.';
    return ORDEN_HORAS_12.some((hora12) =>
      minutos.some((m) => esCombinacionValida(fecha, { hora12, minutos: m, meridiano }, ahora))
    );
  };

  const horaElegida = conHora(fecha, seleccion.hora12, seleccion.minutos, seleccion.meridiano);

  // Aviso de coherencia: hoy solo se puede desde el siguiente tramo válido.
  const esHoy = mismoDia(fecha, ahora);
  const desde = primerInstanteValido(fecha, ahora);
  const hayRestriccion = esHoy && desde.getTime() > inicioDelDia(fecha).getTime();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancelar}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.cardTitle}>Hora del servicio</Text>
            <Text style={styles.preview}>{formatearHora(horaElegida)}</Text>
          </View>

          <View style={styles.wheelsArea}>
            {/* Banda de la fila central (detrás de los números) */}
            <View style={styles.band} pointerEvents="none" />
            <View style={styles.wheelsRow} key={clave}>
              <Wheel
                items={horas}
                indice={indiceHora}
                onIndice={(posicion) => cambiar({ hora12: horas[posicion] })}
                esValido={horaEsValida}
                etiqueta="Hora"
              />
              <Wheel
                items={minutos.map((m) => String(m).padStart(2, '0'))}
                indice={indiceMinuto}
                onIndice={(posicion) => cambiar({ minutos: minutos[posicion] })}
                esValido={minutoEsValido}
                etiqueta="Minutos"
              />
              <Wheel
                items={['a.m.', 'p.m.']}
                indice={indiceMeridiano}
                onIndice={(posicion) => cambiar({ meridiano: posicion === 0 ? 'a.m.' : 'p.m.' })}
                esValido={meridianoEsValido}
                etiqueta="a.m. o p.m."
              />
            </View>
          </View>

          {hayRestriccion ? (
            <Text style={styles.aviso}>
              Hoy solo se pueden elegir horas posteriores a las {formatearHora(desde)}.
            </Text>
          ) : null}

          <View style={styles.actionsRow}>
            <TouchableOpacity style={[styles.actionBtn, styles.cancelBtn]} onPress={onCancelar}>
              <Text style={[styles.actionText, styles.cancelText]}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => onConfirmar(horaCoherente(fecha, horaElegida, ahora))}
            >
              <Text style={styles.actionText}>Aceptar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: DARK_BG,
  },
  preview: {
    fontSize: 15,
    fontWeight: '700',
    color: BLUE,
  },
  wheelsArea: {
    height: ALTO_ITEM * (LADO * 2 + 1),
    justifyContent: 'center',
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: ALTO_ITEM * LADO,
    height: ALTO_ITEM,
    borderRadius: ALTO_ITEM / 2,
    backgroundColor: '#F2F2F2',
  },
  wheelsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wheelColumn: {
    flex: 1,
    height: ALTO_ITEM * (LADO * 2 + 1),
  },
  wheelContent: {
    paddingVertical: ALTO_ITEM * LADO,
  },
  wheelItem: {
    height: ALTO_ITEM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelText: {
    fontSize: 17,
    color: GRIS_TEXTO,
    fontWeight: '500',
  },
  wheelTextActive: {
    fontSize: 20,
    color: DARK_BG,
    fontWeight: '700',
  },
  wheelTextDisabled: {
    color: GRIS_DESHABILITADO,
    textDecorationLine: 'line-through',
  },
  aviso: {
    fontSize: 12,
    color: '#9B3B43',
    marginTop: 8,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: BLUE,
    marginLeft: 10,
  },
  cancelBtn: {
    backgroundColor: '#E9E9E9',
  },
  actionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  cancelText: {
    color: '#333',
  },
});
