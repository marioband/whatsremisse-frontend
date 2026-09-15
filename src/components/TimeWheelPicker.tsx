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
  formatearHora,
  indiceMasCercano,
  Meridiano,
  opcionesHoras,
  opcionesMinutos,
  parteDeHora,
} from '../lib/datetime';

const DARK_BG = '#2D2D2D';
const BLUE = '#3F51B5';

/** Alto de cada fila del carrusel y filas visibles a cada lado. */
const ALTO_ITEM = 44;
const LADO = 2;

interface Props {
  visible: boolean;
  valor: Date;
  onConfirmar: (fecha: Date) => void;
  onCancelar: () => void;
}

interface WheelProps {
  items: (string | number)[];
  indice: number;
  onIndice: (indice: number) => void;
  etiqueta: string;
}

/**
 * Una columna del carrusel: se desplaza y la fila que queda centrada es la
 * elegida (también se puede tocar una fila para centrarla). El índice se calcula
 * desde el desplazamiento, así funciona igual en web (rueda del ratón) y en
 * móvil (arrastre), sin depender de onMomentumScrollEnd.
 */
function Wheel({ items, indice, onIndice, etiqueta }: WheelProps) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: indice * ALTO_ITEM, animated: false });
    // Solo al montar: después manda el desplazamiento del usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const alDesplazar = (evento: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = evento.nativeEvent.contentOffset.y;
    const cercano = Math.max(0, Math.min(items.length - 1, Math.round(y / ALTO_ITEM)));
    if (cercano !== indice) onIndice(cercano);
  };

  const centrarEn = (posicion: number) => {
    onIndice(posicion);
    scrollRef.current?.scrollTo({ y: posicion * ALTO_ITEM, animated: true });
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
          return (
            <TouchableOpacity
              key={`${item}-${posicion}`}
              style={styles.wheelItem}
              activeOpacity={0.8}
              onPress={() => centrarEn(posicion)}
            >
              <Text
                style={[
                  styles.wheelText,
                  seleccionado && styles.wheelTextActive,
                  { opacity: seleccionado ? 1 : Math.max(0.3, 1 - 0.32 * distancia) },
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
 */
export function TimeWheelPicker({ visible, valor, onConfirmar, onCancelar }: Props) {
  const horas = useMemo(() => opcionesHoras(), []);
  const minutos = useMemo(() => opcionesMinutos(), []);

  const inicial = useMemo(() => parteDeHora(valor), [valor]);
  const [indiceHora, setIndiceHora] = useState(() => indiceMasCercano(horas, inicial.hora12));
  const [indiceMinuto, setIndiceMinuto] = useState(() =>
    indiceMasCercano(minutos, inicial.minutos)
  );
  const [indiceMeridiano, setIndiceMeridiano] = useState(inicial.meridiano === 'a.m.' ? 0 : 1);
  const [clave, setClave] = useState(0);

  // Al abrirse, el carrusel se coloca en la hora que ya estaba elegida.
  useEffect(() => {
    if (!visible) return;
    const partes = parteDeHora(valor);
    setIndiceHora(indiceMasCercano(horas, partes.hora12));
    setIndiceMinuto(indiceMasCercano(minutos, partes.minutos));
    setIndiceMeridiano(partes.meridiano === 'a.m.' ? 0 : 1);
    // Fuerza el remontaje de las columnas para que se recolquen en su sitio.
    setClave((actual) => actual + 1);
  }, [visible, valor, horas, minutos]);

  const meridiano: Meridiano = indiceMeridiano === 0 ? 'a.m.' : 'p.m.';
  const horaElegida = conHora(valor, horas[indiceHora], minutos[indiceMinuto], meridiano);

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
              <Wheel items={horas} indice={indiceHora} onIndice={setIndiceHora} etiqueta="Hora" />
              <Wheel
                items={minutos.map((m) => String(m).padStart(2, '0'))}
                indice={indiceMinuto}
                onIndice={setIndiceMinuto}
                etiqueta="Minutos"
              />
              <Wheel
                items={['a.m.', 'p.m.']}
                indice={indiceMeridiano}
                onIndice={setIndiceMeridiano}
                etiqueta="a.m. o p.m."
              />
            </View>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity style={[styles.actionBtn, styles.cancelBtn]} onPress={onCancelar}>
              <Text style={[styles.actionText, styles.cancelText]}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => onConfirmar(horaElegida)}>
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
    color: '#8A8A8A',
    fontWeight: '500',
  },
  wheelTextActive: {
    fontSize: 20,
    color: DARK_BG,
    fontWeight: '700',
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
