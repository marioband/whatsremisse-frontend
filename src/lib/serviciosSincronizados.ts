import { ServiceAlert } from '../types';

/**
 * Sincronización de una fila de `service_alerts`.
 *
 * La misma fila llega por cuatro caminos sin ningún orden garantizado: el
 * sondeo de 6 s del chat, el respaldo de 15 s del store, el tiempo real y la
 * respuesta de la función que acaba de escribir en la base. Antes, el último en
 * llegar ganaba aunque fuera el más antiguo: una lectura que salió ANTES de una
 * declaración (o de un hito del viaje) llegaba DESPUÉS y la pisaba, así que el
 * cuadre de pagos volvía a los botones "Yo pago / Me deben" y el deslizamiento
 * del viaje reaparecía solo.
 *
 * Regla: la base manda, y una foto más antigua no se pisa con una más nueva.
 * En `service_alerts` el disparador `set_service_alerts_updated_at` (0001) pone
 * `updated_at = now()` en CADA escritura, así que la marca sirve para ordenar.
 */

/** Marca de la fila en ms. `null` = objeto armado por la app (no viene de la base). */
function marcaDe(servicio: ServiceAlert | undefined): number | null {
  if (!servicio?.updated_at) return null;
  const ms = new Date(servicio.updated_at).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Escalón del ciclo de pago. RECHAZADO comparte escalón con DECLARADO: es una
 * respuesta del proveedor, no un borrado de la declaración (por eso el orden no
 * puede ser una simple lista ordenada de estados).
 */
const ESCALON_DE_PAGO: Record<string, number> = {
  SIN_DECLARAR: 0,
  DECLARADO: 1,
  RECHAZADO: 1,
  ACEPTADO: 2,
  CONFIRMADO: 3,
};

/** -1 = la fila no dice nada del pago (objeto armado por la app). */
function escalonDePago(servicio: ServiceAlert): number {
  if (!servicio.pago_estado) return -1;
  return ESCALON_DE_PAGO[servicio.pago_estado] ?? -1;
}

/**
 * ¿La fila entrante es una foto vieja? (una lectura que salió antes de un cambio
 * y llegó después). Las filas sin marca de tiempo no se descartan: son ediciones
 * locales de una pantalla, que se aplican tal cual.
 */
export function esFotoVieja(actual: ServiceAlert | undefined, entrante: ServiceAlert): boolean {
  const tActual = marcaDe(actual);
  const tEntrante = marcaDe(entrante);
  if (tActual === null || tEntrante === null) return false;
  return tEntrante < tActual;
}

/**
 * Fusiona la fila que ya está en memoria con la que acaba de llegar.
 *
 * - Una foto vieja no cambia nada.
 * - El paso del viaje nunca retrocede (la base lo garantiza con
 *   `driver_progress_step <= p_paso` en 0012: el cliente no puede ir por otro lado).
 * - El ciclo de pago tampoco: una fila con menos escalón (o un objeto de la app
 *   que no trae los campos de pago) no puede borrar una declaración ya hecha.
 */
export function fusionarServicio(
  actual: ServiceAlert | undefined,
  entrante: ServiceAlert
): ServiceAlert {
  if (!actual) return entrante;
  if (esFotoVieja(actual, entrante)) return actual;

  const fusion: ServiceAlert = { ...actual, ...entrante };

  fusion.driver_progress_step = Math.max(
    actual.driver_progress_step ?? 0,
    entrante.driver_progress_step ?? 0
  );

  if (escalonDePago(entrante) < escalonDePago(actual)) {
    fusion.pago_estado = actual.pago_estado;
    fusion.pago_direccion = actual.pago_direccion;
    fusion.pago_monto = actual.pago_monto;
    fusion.pago_declarado_at = actual.pago_declarado_at;
    fusion.pago_aceptado_at = actual.pago_aceptado_at;
    fusion.pago_aceptado_por = actual.pago_aceptado_por;
    fusion.pago_confirmado_at = actual.pago_confirmado_at;
    fusion.pago_confirmado_por = actual.pago_confirmado_por;
  }

  return fusion;
}

/**
 * Fusiona una lectura completa (el respaldo de 15 s del store) contra lo que ya
 * está en memoria. La lista entrante sigue siendo la que decide QUÉ servicios se
 * ven (si la base ya no devuelve uno, se cae de la lista); lo que se conserva es
 * la versión más nueva de cada fila.
 */
export function fusionarLista(actuales: ServiceAlert[], entrantes: ServiceAlert[]): ServiceAlert[] {
  const porId = new Map(actuales.map((servicio) => [servicio.id, servicio]));
  return entrantes.map((fila) => fusionarServicio(porId.get(fila.id), fila));
}

/**
 * El paso que toca reportar ahora mismo (1 Ubicado, 2 En proceso, 3 Finalizado).
 * Se calcula sobre la fila vigente y no sobre un contador local: la base rechaza
 * retrocesos, así que un paso repetido es inofensivo y uno adelantado cerraba el
 * viaje antes de tiempo (era el cuadre que "aparecía al deslizar").
 */
export function pasoDelSiguienteHito(servicio: ServiceAlert | undefined): number {
  return Math.min((servicio?.driver_progress_step ?? 0) + 1, 3);
}
