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

import { guardarCache, leerCache } from './cache';

export type ApiExterna =
  | 'places:autocompletado'
  | 'places:detalle'
  /** Rutas: se separan porque no cuestan lo mismo (con tráfico = Pro, sin tráfico = Essentials). */
  | 'routes:computeRoutes:conTrafico'
  | 'routes:computeRoutes:sinTrafico'
  | 'google:geocode';

export type MotivoDeAhorro = 'cache' | 'calculo-propio' | 'texto-del-usuario' | 'cercania';

const llamadas: Record<string, number> = {};
const ahorros: Record<string, number> = {};
let ultimoResumenRegistrado = '';

/** Se llama justo antes de salir a la red. */
export function registrarLlamada(api: ApiExterna): void {
  llamadas[api] = (llamadas[api] || 0) + 1;
  acumular('llamadas', api, 1);
}

/** Se llama cuando algo se resolvió sin salir a la red. */
export function registrarAhorro(motivo: MotivoDeAhorro, veces = 1): void {
  ahorros[motivo] = (ahorros[motivo] || 0) + veces;
  acumular('ahorros', motivo, veces);
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

// --- Totales que SOBREVIVEN a la recarga (para medir en campo durante días) ------------------------
//
// El contador de arriba vive en memoria y se pierde cada vez que la webapp se recarga (en el teléfono
// se recarga sola). Para poder responder con datos —y no con suposiciones— «¿cuántas veces al día un
// conductor de verdad pide una ruta?», el total se acumula y se guarda cada pocos segundos.
//
// Es un contador local: no se envía a ningún servidor ni cuesta nada.

const CLAVE_DEL_ACUMULADO = 'medidor:acumulado';
const NOVENTA_DIAS = 90 * 24 * 60 * 60 * 1000;

export interface AcumuladoDelMedidor {
  llamadas: Record<string, number>;
  ahorros: Record<string, number>;
  desde: number;
}

let acumulado: AcumuladoDelMedidor | null = null;
let guardadoPendiente: ReturnType<typeof setTimeout> | null = null;

function acumular(registro: 'llamadas' | 'ahorros', clave: string, veces: number): void {
  if (!acumulado) return; // hasta que se carguen los totales no se acumula (se cargan al arrancar)
  acumulado[registro][clave] = (acumulado[registro][clave] || 0) + veces;
  programarGuardado();
}

function programarGuardado(): void {
  if (guardadoPendiente || !acumulado) return;
  guardadoPendiente = setTimeout(() => {
    guardadoPendiente = null;
    if (!acumulado) return;
    const copia = { ...acumulado };
    void guardarCache(CLAVE_DEL_ACUMULADO, copia, Date.now());
  }, 4000);
}

/** Carga los totales guardados. Se llama al arrancar la app (una sola vez). */
export async function cargarContadores(): Promise<void> {
  if (acumulado) return;
  const guardado = await leerCache<AcumuladoDelMedidor>(CLAVE_DEL_ACUMULADO, NOVENTA_DIAS);
  acumulado =
    guardado && guardado.llamadas
      ? {
          llamadas: { ...guardado.llamadas },
          ahorros: { ...(guardado.ahorros || {}) },
          desde: guardado.desde || Date.now(),
        }
      : { llamadas: {}, ahorros: {}, desde: Date.now() };
}

/** Los totales de este teléfono desde que empezó a contarse. */
export async function leerContadores(): Promise<AcumuladoDelMedidor> {
  await cargarContadores();
  return acumulado as AcumuladoDelMedidor;
}

/**
 * Una línea para Cuenta, sin tecnicismos: es lo que el usuario mira cuando quiere saber «cuánto
 * estamos gastando desde este teléfono».
 */
export function lineaDeContadores(datos: AcumuladoDelMedidor | null): string {
  if (!datos) return '';
  const total = (registro: Record<string, number> | undefined) =>
    Object.values(registro || {}).reduce((suma, n) => suma + n, 0);
  const reales = total(datos.llamadas);
  const evitadas = total(datos.ahorros);
  const desde = datos.desde
    ? new Date(datos.desde).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' })
    : '';
  if (reales === 0 && evitadas === 0) return 'Consultas a Google de este teléfono: 0';
  return (
    `Consultas a Google de este teléfono: ${reales}` +
    ` · evitadas (caché o cálculo propio): ${evitadas}` +
    (desde ? ` (desde el ${desde})` : '')
  );
}
