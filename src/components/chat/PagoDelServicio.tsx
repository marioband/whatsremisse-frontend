import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

import { BankDetailsRow } from './BankDetailsRow';
import {
  AZUL,
  BORDE_SUAVE,
  FONDO_TARJETA,
  OSCURO,
  ROJO_ACCION,
  TEXTO,
  TEXTO_SUAVE,
  TEXTO_TENUE,
  VERDE_ACCION,
} from '../../lib/colors';
import {
  DireccionPago,
  historialDePago,
  leTocaTransferir,
  montoEnTexto,
  puedeConfirmar,
  resumenDePago,
  RolPago,
} from '../../lib/pagoServicio';
import { ServiceAlert } from '../../types';

interface Props {
  service: ServiceAlert;
  rol: RolPago;
  /** Datos de pago del usuario que está mirando (su perfil). */
  misDatos: { yapeNumber?: string; bcpAccount?: string; bcpCci?: string };
  /** Datos de pago del conductor (el proveedor los trae por función autorizada). */
  datosDelConductor: { yape?: string; bcpAccount?: string; bcpCci?: string } | null;
  onDeclarar: (direccion: DireccionPago, monto: number) => void;
  onResolver: (aceptar: boolean) => void;
  onConfirmar: () => void;
  onCopiar: (label: string, value: string) => void;
  /** Hay una operación en curso: se bloquean los botones. */
  ocupado?: boolean;
}

/**
 * Zona superior del chat del servicio cuando el viaje ya terminó: aquí vive el
 * ciclo de pago (declaración del conductor → aceptación del proveedor →
 * confirmación de quien recibe). Reemplaza al panel de cuadre anterior.
 *
 *   - Quien debe pagar ve los datos de pago de quien debe recibir.
 *   - La confirmación final la da siempre quien recibe el dinero.
 */
export function PagoDelServicio({
  service,
  rol,
  misDatos,
  datosDelConductor,
  onDeclarar,
  onResolver,
  onConfirmar,
  onCopiar,
  ocupado = false,
}: Props) {
  const resumen = resumenDePago(service);
  const [direccion, setDireccion] = useState<DireccionPago | null>(null);
  const [monto, setMonto] = useState('');
  const [errorMonto, setErrorMonto] = useState('');

  // Al cambiar el estado (declaración nueva, rechazo) el campo vuelve a empezar
  // con la tarifa de la alerta como sugerencia.
  useEffect(() => {
    setDireccion(null);
    setMonto(service.fare ? String(service.fare) : '');
    setErrorMonto('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumen.estado]);

  const puedeDeclararAhora =
    rol === 'CONDUCTOR' && (resumen.estado === 'SIN_DECLARAR' || resumen.estado === 'RECHAZADO');

  const datosDelReceptor = () => {
    if (resumen.recibe === 'PROVEEDOR') {
      return {
        titulo: 'Datos de pago del proveedor',
        nota: 'Transfiere a estos datos y luego el proveedor confirma la recepción.',
        yape: service.provider_yape,
        cuenta: service.provider_bcp_account,
        cci: service.provider_bcp_cci,
      };
    }
    return {
      titulo: 'Datos de pago del conductor',
      nota:
        rol === 'CONDUCTOR'
          ? 'Estos son tus datos registrados: el proveedor los verá para transferirte.'
          : 'Transfiere a estos datos y luego el conductor confirma la recepción.',
      yape: datosDelConductor?.yape || misDatos.yapeNumber,
      cuenta: datosDelConductor?.bcpAccount || misDatos.bcpAccount,
      cci: datosDelConductor?.bcpCci || misDatos.bcpCci,
    };
  };

  const filaDeEstado = () => {
    if (resumen.estado === 'CONFIRMADO') return { texto: 'Pagado y cerrado', color: VERDE_ACCION };
    if (resumen.estado === 'ACEPTADO') return { texto: 'Pago en camino', color: OSCURO };
    if (resumen.estado === 'DECLARADO') {
      return {
        texto:
          rol === 'PROVEEDOR'
            ? 'El conductor declaró un monto'
            : 'Esperando confirmación del monto',
        color: OSCURO,
      };
    }
    return { texto: 'Pendiente de pago', color: AZUL };
  };

  const fila = filaDeEstado();

  const enviarDeclaracion = () => {
    const valor = Number(monto.replace(',', '.'));
    if (!direccion) {
      setErrorMonto('Elige "Yo pago" o "Me deben".');
      return;
    }
    if (!Number.isFinite(valor) || valor <= 0) {
      setErrorMonto('Escribe un monto mayor que cero.');
      return;
    }
    setErrorMonto('');
    onDeclarar(direccion, Number(valor.toFixed(2)));
  };

  const detalles = datosDelReceptor();

  return (
    <View style={styles.panel}>
      <View style={[styles.fila, { backgroundColor: fila.color }]}>
        <Text style={styles.filaTexto}>{fila.texto}</Text>
      </View>

      <View style={styles.cuerpo}>
        {/* ------------------------------------------------ declaración */}
        {puedeDeclararAhora && (
          <>
            {resumen.estado === 'RECHAZADO' && (
              <Text style={styles.avisoRechazo}>
                El proveedor rechazó el monto, corrígelo y vuelve a declararlo.
              </Text>
            )}

            {!direccion ? (
              <View style={styles.filaBotones}>
                <TouchableOpacity
                  style={[styles.botonDireccion, styles.botonAzul]}
                  onPress={() => setDireccion('DRIVER_PAYS_PROVIDER')}
                  disabled={ocupado}
                >
                  <Text style={styles.botonTexto}>Yo pago</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.botonDireccion, styles.botonOscuro]}
                  onPress={() => setDireccion('PROVIDER_PAYS_DRIVER')}
                  disabled={ocupado}
                >
                  <Text style={styles.botonTexto}>Me deben</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.filaMonto}>
                  <TextInput
                    style={styles.monto}
                    value={monto}
                    onChangeText={setMonto}
                    placeholder="Monto"
                    placeholderTextColor={TEXTO_TENUE}
                    keyboardType="numeric"
                    editable={!ocupado}
                  />
                  <TouchableOpacity
                    style={[styles.botonDeclarar, ocupado && styles.botonApagado]}
                    onPress={enviarDeclaracion}
                    disabled={ocupado}
                  >
                    <Text style={styles.botonTexto}>
                      {direccion === 'DRIVER_PAYS_PROVIDER'
                        ? 'Declarar que pago'
                        : 'Declarar que me deben'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => setDireccion(null)} disabled={ocupado}>
                  <Text style={styles.cambiar}>← cambiar</Text>
                </TouchableOpacity>
                <Text style={styles.ayuda}>
                  {direccion === 'DRIVER_PAYS_PROVIDER'
                    ? 'El cliente te pagó a ti: declaras cuánto le corresponde al proveedor.'
                    : 'Declaras cuánto debe pagarte el proveedor por el servicio.'}
                </Text>
              </>
            )}

            {!!errorMonto && <Text style={styles.error}>{errorMonto}</Text>}
          </>
        )}

        {/* ------------------------------------------------ declarado */}
        {resumen.estado === 'DECLARADO' && (
          <>
            {rol === 'PROVEEDOR' ? (
              <>
                <Text style={styles.declaracion}>{resumen.declaracion}</Text>
                <View style={styles.filaBotones}>
                  <TouchableOpacity
                    style={[
                      styles.botonDireccion,
                      styles.botonVerde,
                      ocupado && styles.botonApagado,
                    ]}
                    onPress={() => onResolver(true)}
                    disabled={ocupado}
                  >
                    <Text style={styles.botonTexto}>Aceptar monto</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.botonDireccion,
                      styles.botonRojo,
                      ocupado && styles.botonApagado,
                    ]}
                    onPress={() => onResolver(false)}
                    disabled={ocupado}
                  >
                    <Text style={styles.botonTexto}>Rechazar</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <Text style={styles.espera}>
                Declaraste {montoEnTexto(resumen.monto)}. Esperando que el proveedor confirme el
                monto.
              </Text>
            )}
          </>
        )}

        {/* ------------------------------------------------ pago en camino */}
        {resumen.estado === 'ACEPTADO' && (
          <>
            {leTocaTransferir(service, rol) ? (
              <Text style={styles.espera}>
                Monto aceptado: {montoEnTexto(resumen.monto)}. Haz la transferencia a los datos de
                abajo.
              </Text>
            ) : (
              <Text style={styles.espera}>
                {montoEnTexto(resumen.monto)} en camino. Confirma cuando recibas el dinero.
              </Text>
            )}

            {puedeConfirmar(service, rol) && (
              <TouchableOpacity
                style={[styles.botonConfirmar, ocupado && styles.botonApagado]}
                onPress={onConfirmar}
                disabled={ocupado}
              >
                <Text style={styles.botonTexto}>Confirmar pago recibido</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* ------------------------------------------------ cerrado */}
        {resumen.estado === 'CONFIRMADO' && (
          <Text style={styles.historial}>✅ {historialDePago(service) || 'Pago confirmado'}</Text>
        )}

        {/* ------------------------------------------------ datos de pago */}
        {resumen.estado !== 'CONFIRMADO' &&
          (resumen.estado === 'SIN_DECLARAR' || resumen.estado === 'RECHAZADO') &&
          !puedeDeclararAhora && (
            <Text style={styles.espera}>Esperando que el conductor declare el monto del pago.</Text>
          )}

        {resumen.direccion !== null && resumen.estado !== 'RECHAZADO' && (
          <View style={styles.datosPago}>
            <Text style={styles.datosTitulo}>{detalles.titulo}</Text>
            <Text style={styles.datosNota}>{detalles.nota}</Text>
            {!!detalles.yape && (
              <BankDetailsRow
                label="Yape / Plin"
                value={detalles.yape}
                onCopy={(v) => onCopiar('Yape / Plin', v)}
              />
            )}
            {!!detalles.cuenta && (
              <BankDetailsRow
                label="Cuenta bancaria"
                value={detalles.cuenta}
                onCopy={(v) => onCopiar('Cuenta bancaria', v)}
              />
            )}
            {!!detalles.cci && (
              <BankDetailsRow label="CCI" value={detalles.cci} onCopy={(v) => onCopiar('CCI', v)} />
            )}
            {!detalles.yape && !detalles.cuenta && !detalles.cci && (
              <Text style={styles.espera}>
                No hay medios de pago registrados en el perfil de quien debe recibir.
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 0.5,
    borderBottomColor: BORDE_SUAVE,
  },
  fila: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  filaTexto: { color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  cuerpo: { padding: 12 },
  filaBotones: { flexDirection: 'row' },
  filaMonto: { flexDirection: 'row', alignItems: 'center' },
  botonDireccion: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 12,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  botonAzul: { backgroundColor: AZUL },
  botonOscuro: { backgroundColor: OSCURO },
  botonVerde: { backgroundColor: VERDE_ACCION },
  botonRojo: { backgroundColor: ROJO_ACCION },
  botonDeclarar: {
    flex: 1,
    backgroundColor: AZUL,
    borderRadius: 20,
    paddingVertical: 12,
    alignItems: 'center',
    marginLeft: 8,
  },
  botonConfirmar: {
    backgroundColor: VERDE_ACCION,
    borderRadius: 20,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  botonApagado: { opacity: 0.5 },
  botonTexto: { color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  monto: {
    flex: 1,
    backgroundColor: FONDO_TARJETA,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: TEXTO,
  },
  cambiar: { color: AZUL, fontSize: 12, marginTop: 8, textAlign: 'center' },
  ayuda: { color: TEXTO_TENUE, fontSize: 11, marginTop: 8, textAlign: 'center' },
  avisoRechazo: {
    color: ROJO_ACCION,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 10,
  },
  declaracion: {
    color: TEXTO,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  espera: { color: TEXTO_SUAVE, fontSize: 13, textAlign: 'center' },
  historial: { color: VERDE_ACCION, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  error: { color: ROJO_ACCION, fontSize: 12, marginTop: 8, textAlign: 'center' },
  datosPago: { marginTop: 14 },
  datosTitulo: { color: TEXTO, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  datosNota: { color: TEXTO_SUAVE, fontSize: 11, marginBottom: 8 },
});
