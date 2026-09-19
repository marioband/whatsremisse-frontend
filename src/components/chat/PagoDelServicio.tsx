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
  leTocaVerLosDatosDePago,
  montoEnTexto,
  puedeConfirmar,
  recibeDe,
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
  /**
   * Datos de pago del proveedor (el conductor los trae por función autorizada):
   * en el caso A el conductor es quien transfiere, así que los necesita dentro
   * del chat, y desde el paso 1 ("siempre visibles").
   */
  datosDelProveedor?: {
    yape?: string;
    bcpAccount?: string;
    bcpCci?: string;
    nombre?: string;
  } | null;
  onDeclarar: (direccion: DireccionPago, monto: number) => void;
  onResolver: (aceptar: boolean) => void;
  onConfirmar: () => void;
  onCopiar: (label: string, value: string) => void;
  /** Hay una operación en curso: se bloquean los botones. */
  ocupado?: boolean;
  /**
   * El pago acaba de confirmarse en esta pantalla y la conversación se va a cerrar
   * sola: se avisa para que no parezca que la app se cayó.
   */
  cerrando?: boolean;
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
  datosDelProveedor = null,
  onDeclarar,
  onResolver,
  onConfirmar,
  onCopiar,
  ocupado = false,
  cerrando = false,
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

  /**
   * Dirección de pago que manda en pantalla: mientras el conductor está declarando
   * vale su elección local (aún no está en la base); ya declarada, la de la fila.
   */
  const direccionEfectiva: DireccionPago | null =
    resumen.estado === 'SIN_DECLARAR' || resumen.estado === 'RECHAZADO'
      ? direccion
      : resumen.direccion;

  /**
   * Los datos de pago los ve SOLO quien tiene que pagar, y son los de quien recibe:
   * si el conductor declara "Me deben" (paga el proveedor) el conductor no ve los
   * medios del proveedor; si declara "Yo pago", los ve él para transferir.
   */
  const datosDePagoVisibles =
    leTocaVerLosDatosDePago(direccionEfectiva, rol) && resumen.estado !== 'CONFIRMADO';

  /** Medios de pago de quien RECIBE el dinero según la dirección. */
  const datosDelReceptor = () => {
    if (recibeDe(direccionEfectiva) === 'PROVEEDOR') {
      return {
        titulo: 'Datos de pago del proveedor',
        nota: datosDelProveedor?.nombre
          ? `Transfiere a ${datosDelProveedor.nombre} y luego él confirma la recepción.`
          : 'Transfiere a estos datos y luego el proveedor confirma la recepción.',
        yape: datosDelProveedor?.yape || service.provider_yape,
        cuenta: datosDelProveedor?.bcpAccount || service.provider_bcp_account,
        cci: datosDelProveedor?.bcpCci || service.provider_bcp_cci,
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

  /** Bloque de medios de pago, con el botón de copiar en cada uno. */
  const bloqueDatos = (d: {
    titulo: string;
    nota: string;
    yape?: string;
    cuenta?: string;
    cci?: string;
  }) => (
    <View style={styles.datosPago}>
      <Text style={styles.datosTitulo}>{d.titulo}</Text>
      <Text style={styles.datosNota}>{d.nota}</Text>
      {!!d.yape && (
        <BankDetailsRow
          label="Yape / Plin"
          value={d.yape}
          onCopy={(v) => onCopiar('Yape / Plin', v)}
        />
      )}
      {!!d.cuenta && (
        <BankDetailsRow
          label="Cuenta bancaria"
          value={d.cuenta}
          onCopy={(v) => onCopiar('Cuenta bancaria', v)}
        />
      )}
      {!!d.cci && <BankDetailsRow label="CCI" value={d.cci} onCopy={(v) => onCopiar('CCI', v)} />}
      {!d.yape && !d.cuenta && !d.cci && (
        <Text style={styles.espera}>
          No hay medios de pago registrados en el perfil de quien debe recibir.
        </Text>
      )}
    </View>
  );

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
                  accessibilityRole="button"
                  accessibilityLabel="Yo pago"
                  disabled={ocupado}
                >
                  <Text style={styles.botonTexto}>Yo pago</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.botonDireccion, styles.botonOscuro]}
                  onPress={() => setDireccion('PROVIDER_PAYS_DRIVER')}
                  accessibilityRole="button"
                  accessibilityLabel="Me deben"
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
                    accessibilityRole="button"
                    accessibilityLabel="Declarar el monto"
                    disabled={ocupado}
                  >
                    <Text style={styles.botonTexto}>
                      {direccion === 'DRIVER_PAYS_PROVIDER'
                        ? 'Declarar que pago'
                        : 'Declarar que me deben'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={() => setDireccion(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Cambiar de dirección del pago"
                  disabled={ocupado}
                >
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
                    accessibilityRole="button"
                    accessibilityLabel="Aceptar monto"
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
                    accessibilityRole="button"
                    accessibilityLabel="Rechazar monto"
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
                accessibilityRole="button"
                accessibilityLabel="Confirmar pago recibido"
                disabled={ocupado}
              >
                <Text style={styles.botonTexto}>Confirmar pago recibido</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* ------------------------------------------------ cerrado */}
        {resumen.estado === 'CONFIRMADO' && (
          <>
            {/* Sin el check verde (retirado el 18-09-2026): el texto ya cuenta el cierre. */}
            <Text style={styles.historial}>{historialDePago(service) || 'Pago confirmado'}</Text>
            {cerrando && (
              <Text style={[styles.espera, styles.cierre]}>
                Cerrando la conversación… el servicio queda en Mis servicios.
              </Text>
            )}
          </>
        )}

        {/* ------------------------------------------------ datos de pago */}
        {/* Solo los ve QUIEN TIENE QUE PAGAR, y son los de quien recibe el dinero:
            el conductor que declara "Me deben" no ve los medios del proveedor; el
            que declara "Yo pago" sí los ve, porque es él quien transfiere. */}
        {datosDePagoVisibles && bloqueDatos(datosDelReceptor())}

        {resumen.estado !== 'CONFIRMADO' &&
          (resumen.estado === 'SIN_DECLARAR' || resumen.estado === 'RECHAZADO') &&
          !puedeDeclararAhora && (
            <Text style={styles.espera}>Esperando que el conductor declare el monto del pago.</Text>
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
  cierre: { marginTop: 8 },
  historial: { color: VERDE_ACCION, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  error: { color: ROJO_ACCION, fontSize: 12, marginTop: 8, textAlign: 'center' },
  datosPago: { marginTop: 14 },
  datosTitulo: { color: TEXTO, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  datosNota: { color: TEXTO_SUAVE, fontSize: 11, marginBottom: 8 },
});
