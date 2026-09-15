import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';

import {
  ABREVIATURAS_DIAS,
  matrizDelMes,
  mesCorto,
  mismoDia,
  NOMBRES_MESES,
  sumarMeses,
  tituloMes,
} from '../lib/datetime';

const DARK_BG = '#2D2D2D';
const BLUE = '#3F51B5';

interface Props {
  visible: boolean;
  /** Fecha seleccionada actualmente. */
  valor: Date;
  /** Primer día seleccionable (por defecto, hoy: no se agenda en el pasado). */
  minimo?: Date;
  onSeleccionar: (fecha: Date) => void;
  onCancelar: () => void;
}

/**
 * Calendario interactivo: mes completo, de lunes a domingo, con navegación de
 * mes en mes y selector de mes/año. El día elegido se marca con un círculo azul
 * y hoy queda señalado aunque no esté seleccionado.
 */
export function CalendarMonthPicker({ visible, valor, minimo, onSeleccionar, onCancelar }: Props) {
  const hoy = useMemo(() => new Date(), []);
  const [vista, setVista] = useState(() => ({ anio: valor.getFullYear(), mes: valor.getMonth() }));
  const [eligiendoMes, setEligiendoMes] = useState(false);

  // Cada vez que se abre, el calendario se sitúa en el mes de la fecha elegida.
  useEffect(() => {
    if (visible) {
      setVista({ anio: valor.getFullYear(), mes: valor.getMonth() });
      setEligiendoMes(false);
    }
  }, [visible, valor]);

  const primerDiaSeleccionable = useMemo(() => {
    const base = minimo ? new Date(minimo.getTime()) : new Date(hoy.getTime());
    base.setHours(0, 0, 0, 0);
    return base;
  }, [minimo, hoy]);

  const filas = useMemo(() => matrizDelMes(vista.anio, vista.mes), [vista]);
  const cambiarMes = (delta: number) =>
    setVista((actual) => sumarMeses(actual.anio, actual.mes, delta));

  const seleccionarDia = (dia: number) => {
    const elegida = new Date(valor.getTime());
    elegida.setFullYear(vista.anio, vista.mes, dia);
    onSeleccionar(elegida);
  };

  const seleccionarHoy = () => {
    const elegida = new Date(valor.getTime());
    elegida.setFullYear(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    onSeleccionar(elegida);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancelar}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Fecha del servicio</Text>

          {eligiendoMes ? (
            /* ---- Selector de mes y año ---- */
            <View>
              <View style={styles.monthHeader}>
                <TouchableOpacity
                  style={styles.arrowBtn}
                  onPress={() => setVista((a) => ({ ...a, anio: a.anio - 1 }))}
                >
                  <Text style={styles.arrow}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.yearText}>{vista.anio}</Text>
                <TouchableOpacity
                  style={styles.arrowBtn}
                  onPress={() => setVista((a) => ({ ...a, anio: a.anio + 1 }))}
                >
                  <Text style={styles.arrow}>›</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.monthsGrid}>
                {NOMBRES_MESES.map((nombre, indice) => {
                  const activo = indice === vista.mes;
                  return (
                    <TouchableOpacity
                      key={nombre}
                      style={[styles.monthCell, activo && styles.monthCellActive]}
                      onPress={() => {
                        setVista((a) => ({ ...a, mes: indice }));
                        setEligiendoMes(false);
                      }}
                    >
                      <Text style={[styles.monthCellText, activo && styles.monthCellTextActive]}>
                        {mesCorto(indice)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : (
            /* ---- Mes en curso ---- */
            <View>
              <View style={styles.monthHeader}>
                <TouchableOpacity
                  style={styles.titleBtn}
                  onPress={() => setEligiendoMes(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.titleText}>{tituloMes(vista.anio, vista.mes)}</Text>
                  <Text style={styles.titleChevron}>›</Text>
                </TouchableOpacity>
                <View style={styles.arrowsGroup}>
                  <TouchableOpacity style={styles.arrowBtn} onPress={() => cambiarMes(-1)}>
                    <Text style={styles.arrow}>‹</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.arrowBtn} onPress={() => cambiarMes(1)}>
                    <Text style={styles.arrow}>›</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.weekRow}>
                {ABREVIATURAS_DIAS.map((dia) => (
                  <Text key={dia} style={styles.weekDay}>
                    {dia}
                  </Text>
                ))}
              </View>

              {filas.map((fila, indiceFila) => (
                <View key={`fila-${indiceFila}`} style={styles.dayRow}>
                  {fila.map((dia, indiceCol) => {
                    if (dia === null) {
                      return <View key={`hueco-${indiceCol}`} style={styles.dayCell} />;
                    }
                    const fecha = new Date(vista.anio, vista.mes, dia);
                    const seleccionado = mismoDia(fecha, valor);
                    const esHoy = mismoDia(fecha, hoy);
                    const habilitado = fecha.getTime() >= primerDiaSeleccionable.getTime();

                    return (
                      <TouchableOpacity
                        key={`dia-${dia}`}
                        style={styles.dayCell}
                        disabled={!habilitado}
                        onPress={() => seleccionarDia(dia)}
                        activeOpacity={0.7}
                      >
                        <View
                          style={[
                            styles.dayCircle,
                            seleccionado && styles.dayCircleSelected,
                            !seleccionado && esHoy && styles.dayCircleToday,
                          ]}
                        >
                          <Text
                            style={[
                              styles.dayText,
                              seleccionado && styles.dayTextSelected,
                              !habilitado && styles.dayTextDisabled,
                            ]}
                          >
                            {dia}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          )}

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={seleccionarHoy}>
              <Text style={styles.actionText}>Hoy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.cancelBtn]} onPress={onCancelar}>
              <Text style={[styles.actionText, styles.cancelText]}>Cancelar</Text>
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
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: DARK_BG,
    marginBottom: 12,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  titleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleText: {
    fontSize: 16,
    fontWeight: '700',
    color: DARK_BG,
  },
  titleChevron: {
    fontSize: 18,
    fontWeight: '700',
    color: BLUE,
    marginLeft: 6,
  },
  arrowsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  arrowBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  arrow: {
    fontSize: 22,
    fontWeight: '700',
    color: BLUE,
  },
  yearText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: DARK_BG,
  },
  monthsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  monthCell: {
    width: '31%',
    marginRight: '3.5%',
    marginBottom: 10,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
  },
  monthCellActive: {
    backgroundColor: BLUE,
  },
  monthCellText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  monthCellTextActive: {
    color: '#fff',
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekDay: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#999',
    letterSpacing: 0.5,
  },
  dayRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 5,
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleSelected: {
    backgroundColor: BLUE,
  },
  dayCircleToday: {
    borderWidth: 1,
    borderColor: BLUE,
  },
  dayText: {
    fontSize: 15,
    color: '#333',
  },
  dayTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  dayTextDisabled: {
    color: '#C4C4C4',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
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
  cancelText: {
    color: '#333',
  },
  actionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
