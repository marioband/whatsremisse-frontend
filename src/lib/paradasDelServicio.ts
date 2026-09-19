import { etiquetaDelHito } from './barraDeProceso';
import type { ServiceAlert } from '../types';

/** Lo que «Nuevo servicio» deja con los puntos intermedios, dentro de las observaciones. */
const MARCA_DE_PARADAS = /^paradas?\s*:\s*(.+)$/i;

type ServicioConParadas = Pick<
  ServiceAlert,
  'destinations' | 'observations' | 'destination_address'
>;

/**
 * Las paradas del servicio, en orden. La ÚLTIMA es el destino final.
 *
 * Se leen de la columna `destinations` (migración 0027) y, cuando el servicio es anterior o la
 * migración aún no está aplicada, del texto «Paradas: A, B» que «Nuevo servicio» guardaba dentro
 * de las observaciones: así los servicios ya publicados también muestran sus paradas.
 *
 * Un servicio con una sola parada devuelve un arreglo con el destino final —nunca vacío, para
 * que nadie tenga que preguntarse si es «una parada» o «no hay paradas»—.
 */
export function paradasDelServicio(servicio: ServicioConParadas | undefined): string[] {
  if (!servicio) return [];

  const guardadas = (servicio.destinations ?? [])
    .map((parada) => (parada ?? '').trim())
    .filter(Boolean);
  if (guardadas.length > 0) return guardadas;

  for (const observacion of servicio.observations ?? []) {
    const encontrado = MARCA_DE_PARADAS.exec((observacion ?? '').trim());
    if (!encontrado) continue;
    const intermedias = encontrado[1]
      .split(',')
      .map((parada) => parada.trim())
      .filter(Boolean);
    const final = (servicio.destination_address ?? '').trim();
    if (intermedias.length > 0) return final ? [...intermedias, final] : intermedias;
  }

  const final = (servicio.destination_address ?? '').trim();
  return final ? [final] : [];
}

/**
 * ¿El viaje tiene más de un punto? Entonces el avance va parada por parada y el conductor no
 * reporta «Ubicado / En proceso / Finalizado» sino «Ir a destino 1», «Ir a destino 2»…
 */
export function hayVariasParadas(servicio: ServicioConParadas | undefined): boolean {
  return paradasDelServicio(servicio).length > 1;
}

/**
 * Cuántos pasos tiene el reporte del conductor.
 *
 *   * una parada (el servicio de siempre): 3 pasos — Ubicado, En proceso, Finalizado;
 *   * N paradas: N pasos «Ir a destino k» y el último, «Finalizado».
 *
 * Es también el número del paso que CIERRA el viaje (`driver_progress_step`).
 */
export function totalDePasos(servicio: ServicioConParadas | undefined): number {
  const paradas = paradasDelServicio(servicio).length;
  return paradas > 1 ? paradas + 1 : 3;
}

/**
 * Texto del paso `paso` (1..totalDePasos). El último siempre es «Finalizado».
 *
 * Con varias paradas el penúltimo destino también se reporta: son los pasos 1..N.
 */
export function etiquetaDelPaso(servicio: ServicioConParadas | undefined, paso: number): string {
  const total = totalDePasos(servicio);
  const numero = Math.min(Math.max(Math.trunc(paso), 1), total);
  if (!hayVariasParadas(servicio)) return etiquetaDelHito(numero - 1);
  return numero >= total ? 'Finalizado' : `Ir a destino ${numero}`;
}

/** El nombre de la parada del paso `paso`, si se conoce (para el reporte del chat). */
export function paradaDelPaso(
  servicio: ServicioConParadas | undefined,
  paso: number
): string | undefined {
  const paradas = paradasDelServicio(servicio);
  if (paradas.length <= 1) return undefined;
  const numero = Math.trunc(paso);
  if (numero < 1 || numero > paradas.length) return undefined;
  return paradas[numero - 1];
}

/**
 * ¿El viaje ya terminó? Es la ÚNICA regla para decidir si empieza el ciclo de pago.
 *
 * Antes cada sitio lo comparaba con 3 a mano, que es el total de un servicio de un solo destino;
 * con paradas el último paso es otro y medio viaje se habría dado por terminado.
 */
export function viajeTerminado(servicio: ServiceAlert | undefined): boolean {
  if (!servicio) return false;
  if (servicio.status === 'STATUS_COMPLETED') return true;
  return (servicio.driver_progress_step ?? 0) >= totalDePasos(servicio);
}

/** «Destino 2 de 3»: el avance en palabras, para el reporte que ve el proveedor. */
export function avanceEnPalabras(
  servicio: ServicioConParadas | undefined,
  paso: number,
  total = totalDePasos(servicio)
): string | undefined {
  const paradas = paradasDelServicio(servicio);
  if (paradas.length <= 1) return undefined;
  const numero = Math.min(Math.max(Math.trunc(paso), 1), total);
  return numero >= total ? 'Destino final alcanzado' : `Destino ${numero} de ${paradas.length}`;
}
