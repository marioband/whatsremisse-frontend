import { ServiceAlert } from '../types';
import { viajeTerminado } from './paradasDelServicio';

export type DireccionPago = 'DRIVER_PAYS_PROVIDER' | 'PROVIDER_PAYS_DRIVER';
export type EstadoPago = 'SIN_DECLARAR' | 'DECLARADO' | 'RECHAZADO' | 'ACEPTADO' | 'CONFIRMADO';
export type RolPago = 'CONDUCTOR' | 'PROVEEDOR';

export interface ResumenPago {
  estado: EstadoPago;
  direccion: DireccionPago | null;
  monto: number | null;
  /** Quién debe pagar (y por eso ve los datos de pago de quien recibe). */
  paga: RolPago | null;
  /** Quién recibe el dinero: el único que puede confirmar el pago. */
  recibe: RolPago | null;
  /** Lo que declara el conductor, tal como lo lee el proveedor. */
  declaracion: string;
  cerrado: boolean;
}

export const montoEnTexto = (monto: number | null | undefined): string =>
  monto === null || monto === undefined ? '' : `S/ ${Number(monto).toFixed(2)}`;

/** Quién debe transferir según la dirección declarada. */
export function pagaDe(direccion: DireccionPago | null | undefined): RolPago | null {
  if (direccion === 'DRIVER_PAYS_PROVIDER') return 'CONDUCTOR';
  if (direccion === 'PROVIDER_PAYS_DRIVER') return 'PROVEEDOR';
  return null;
}

/** Quién recibe el dinero (y por eso es el único que confirma). */
export function recibeDe(direccion: DireccionPago | null | undefined): RolPago | null {
  const paga = pagaDe(direccion);
  return paga === 'CONDUCTOR' ? 'PROVEEDOR' : paga === 'PROVEEDOR' ? 'CONDUCTOR' : null;
}

/**
 * ¿Este rol tiene que ver los datos de pago?
 *
 * Solo **quien debe pagar** los ve (y son los de quien recibe el dinero): si el
 * conductor declara "Me deben" los datos son para el proveedor, no para él; si
 * declara "Yo pago", los ve él para hacer la transferencia. Antes el conductor
 * veía los medios del proveedor desde el primer paso, en las dos direcciones.
 */
export function leTocaVerLosDatosDePago(
  direccion: DireccionPago | null | undefined,
  rol: RolPago
): boolean {
  return pagaDe(direccion) === rol;
}

/**
 * Estado del pago derivado de la fila del servicio. Es la única fuente de
 * verdad del ciclo declaración → aceptación/rechazo → confirmación: la UI no
 * decide nada por su cuenta.
 */
export function resumenDePago(service: ServiceAlert): ResumenPago {
  const estado = (service.pago_estado || 'SIN_DECLARAR') as EstadoPago;
  const direccion = (service.pago_direccion || null) as DireccionPago | null;
  const monto = service.pago_monto ?? null;

  const paga = pagaDe(direccion);
  const recibe = recibeDe(direccion);

  let declaracion = '';
  if (direccion === 'DRIVER_PAYS_PROVIDER') {
    declaracion = `El conductor declara que te debe ${montoEnTexto(monto)}`;
  } else if (direccion === 'PROVIDER_PAYS_DRIVER') {
    declaracion = `El conductor declara que le debes ${montoEnTexto(monto)}`;
  }

  return { estado, direccion, monto, paga, recibe, declaracion, cerrado: estado === 'CONFIRMADO' };
}

/** El conductor declara (y corrige tras un rechazo). */
export function puedeDeclarar(service: ServiceAlert, rol: RolPago): boolean {
  // El viaje termina en su ÚLTIMO paso, no en el 3: con paradas el 3 es un destino intermedio.
  return rol === 'CONDUCTOR' && viajeTerminado(service);
}

/** El proveedor acepta o rechaza el monto declarado. */
export function puedeResolver(service: ServiceAlert, rol: RolPago): boolean {
  return rol === 'PROVEEDOR' && resumenDePago(service).estado === 'DECLARADO';
}

/** Confirma solo quien recibe el dinero. */
export function puedeConfirmar(service: ServiceAlert, rol: RolPago): boolean {
  const resumen = resumenDePago(service);
  return resumen.estado === 'ACEPTADO' && resumen.recibe === rol;
}

/** ¿Este rol debe transferir ahora? (ve los datos de quien recibe) */
export function leTocaTransferir(service: ServiceAlert, rol: RolPago): boolean {
  const resumen = resumenDePago(service);
  return resumen.estado === 'ACEPTADO' && resumen.paga === rol;
}

/**
 * Línea de historial del cierre, para Mis servicios: monto, quién pagó y quién
 * confirmó, con la fecha (es lo que queda para un reclamo posterior).
 */
export function historialDePago(service: ServiceAlert): string | null {
  const resumen = resumenDePago(service);
  if (!resumen.cerrado || resumen.monto === null) return null;

  const fecha = service.pago_confirmado_at
    ? new Date(service.pago_confirmado_at).toLocaleString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const pago = resumen.paga === 'CONDUCTOR' ? 'el conductor' : 'el proveedor';
  const confirmo = resumen.recibe === 'PROVEEDOR' ? 'el proveedor' : 'el conductor';
  return `${montoEnTexto(resumen.monto)} · pagó ${pago} · confirmó ${confirmo}${fecha ? ` (${fecha})` : ''}`;
}
