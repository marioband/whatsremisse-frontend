/**
 * Medidor de llamadas externas.
 *
 * El objetivo del proyecto es que crecer en alertas, posiciones GPS y búsquedas
 * NO haga crecer el costo de APIs. Para poder demostrarlo (y detectar regresiones
 * cuando alguien añada una pantalla nueva) se cuentan las dos cosas:
 *   - las llamadas que de verdad salen hacia Google;
 *   - las que se EVITARON (caché, cálculo propio, base de datos, texto del
 *     usuario, descarte por cercanía).
 *
 * Con eso el resumen dice, por ejemplo: "12 medidas evitadas por caché y 3
 * llamadas reales". No cuesta nada: es un contador en memoria.
 */

export type ApiExterna =
  'places:autocompletado' | 'places:detalle' | 'routes:computeRoutes' | 'google:geocode';

export type MotivoDeAhorro = 'cache' | 'calculo-propio' | 'texto-del-usuario' | 'cercania';

const llamadas: Record<string, number> = {};
const ahorros: Record<string, number> = {};
let ultimoResumenRegistrado = '';

/** Se llama justo antes de salir a la red. */
export function registrarLlamada(api: ApiExterna): void {
  llamadas[api] = (llamadas[api] || 0) + 1;
}

/** Se llama cuando algo se resolvió sin salir a la red. */
export function registrarAhorro(motivo: MotivoDeAhorro, veces = 1): void {
  ahorros[motivo] = (ahorros[motivo] || 0) + veces;
}

export interface ResumenDeLlamadas {
  llamadas: { api: string; veces: number }[];
  ahorros: { motivo: string; veces: number }[];
  totalLlamadas: number;
  totalAhorros: number;
}

export function resumenDeLlamadas(): ResumenDeLlamadas {
  const ordenar = (registro: Record<string, number>) =>
    Object.entries(registro)
      .map(([clave, veces]) => ({ api: clave, motivo: clave, veces }))
      .sort((a, b) => b.veces - a.veces);

  const totalLlamadas = Object.values(llamadas).reduce((suma, n) => suma + n, 0);
  const totalAhorros = Object.values(ahorros).reduce((suma, n) => suma + n, 0);

  return {
    llamadas: ordenar(llamadas),
    ahorros: ordenar(ahorros).map(({ motivo, veces }) => ({ motivo, veces })),
    totalLlamadas,
    totalAhorros,
  };
}

/** Texto corto para mostrar en pantalla o en la consola. */
export function textoDelResumen(resumen = resumenDeLlamadas()): string {
  const lineasLlamadas =
    resumen.llamadas.length > 0
      ? resumen.llamadas.map((l) => `${l.api}: ${l.veces}`).join('\n')
      : 'ninguna';
  const lineasAhorros =
    resumen.ahorros.length > 0
      ? resumen.ahorros.map((a) => `${a.motivo}: ${a.veces}`).join('\n')
      : 'ninguno';
  return (
    `Llamadas a Google (${resumen.totalLlamadas}):\n${lineasLlamadas}\n\n` +
    `Evitadas (${resumen.totalAhorros}):\n${lineasAhorros}`
  );
}

/**
 * Registra el resumen en la consola una sola vez cada vez que cambia, para poder
 * ver el ahorro real mientras se prueba sin llenar la consola.
 */
export function registrarResumenEnConsola(): void {
  const resumen = resumenDeLlamadas();
  const firma = `${resumen.totalLlamadas}|${resumen.totalAhorros}`;
  if (firma === ultimoResumenRegistrado) return;
  ultimoResumenRegistrado = firma;
  // eslint-disable-next-line no-console
  console.log(`[medidor] ${textoDelResumen(resumen).replace(/\n/g, ' | ')}`);
}

export function reiniciarContadores(): void {
  Object.keys(llamadas).forEach((clave) => delete llamadas[clave]);
  Object.keys(ahorros).forEach((clave) => delete ahorros[clave]);
  ultimoResumenRegistrado = '';
}
