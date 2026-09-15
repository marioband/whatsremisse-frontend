/**
 * Fecha y hora del servicio.
 *
 * Todo lo que se puede calcular sin React vive aquí, para poder probarlo con
 * node (ver las pruebas que acompañan al cambio). Reglas del proyecto:
 *  - la fecha por defecto es HOY;
 *  - la hora por defecto es la SIGUIENTE hora en punto (10:51 -> 11:00,
 *    10:01 -> 11:00, 10:00 -> 10:00 porque ya está redondeada);
 *  - el calendario se muestra de lunes a domingo, con navegación por meses.
 */

export const NOMBRES_MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/** Cabecera del calendario: lunes primero. */
export const ABREVIATURAS_DIAS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];

export type Meridiano = 'a.m.' | 'p.m.';

/** Milisegundos que tiene un día (para comparar días completos). */
const MS_DIA = 24 * 60 * 60 * 1000;

/** Copia la fecha a las 00:00 locales. */
export function inicioDelDia(fecha: Date): Date {
  const copia = new Date(fecha.getTime());
  copia.setHours(0, 0, 0, 0);
  return copia;
}

/** ¿Son el mismo día (año, mes y día)? */
export function mismoDia(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * La siguiente hora en punto. Si ya estamos en una hora exacta (minutos y
 * segundos en cero) devuelve esa misma hora; en cualquier otro caso sube a la
 * hora siguiente. Ejemplos: 10:51 -> 11:00, 10:01 -> 11:00, 10:00 -> 10:00,
 * 23:30 -> 00:00 del día siguiente.
 */
export function proximaHoraRedondeada(desde: Date = new Date()): Date {
  const yaEnPunto =
    desde.getMinutes() === 0 && desde.getSeconds() === 0 && desde.getMilliseconds() === 0;
  const resultado = new Date(desde.getTime());
  resultado.setMinutes(0, 0, 0); // minutos y segundos a cero: es una hora EN PUNTO
  if (!yaEnPunto) resultado.setHours(resultado.getHours() + 1);
  return resultado;
}

/** "11:00 a.m." */
export function formatearHora(fecha: Date): string {
  const { hora12, minutos, meridiano } = parteDeHora(fecha);
  return `${hora12}:${String(minutos).padStart(2, '0')} ${meridiano}`;
}

/** "11:00" (24 h), el formato que ya se usaba en la app. */
export function formatearHora24(fecha: Date): string {
  return `${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}`;
}

/** "15/09/2026" */
export function formatearFecha(fecha: Date): string {
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${fecha.getFullYear()}`;
}

/** Texto corto al lado de la fecha: "hoy", "mañana", "en 3 días"... */
export function etiquetaRelativa(fecha: Date, hoy: Date = new Date()): string {
  const dias = Math.round((inicioDelDia(fecha).getTime() - inicioDelDia(hoy).getTime()) / MS_DIA);
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  if (dias === 2) return 'pasado mañana';
  if (dias === -1) return 'ayer';
  if (dias > 2 && dias < 7) return `en ${dias} días`;
  return '';
}

/** "Septiembre de 2026" */
export function tituloMes(anio: number, mes: number): string {
  return `${NOMBRES_MESES[mes]} de ${anio}`;
}

/** Tres letras del mes para la rejilla de selección: "Ene", "Sep"... */
export function mesCorto(mes: number): string {
  return NOMBRES_MESES[mes].slice(0, 3);
}

/**
 * Rejilla del mes, de lunes a domingo. Cada celda es el número del día o null
 * para los huecos de la primera y la última semana (así el 1 cae bajo su día
 * real y la cuadrícula queda alineada).
 */
export function matrizDelMes(anio: number, mes: number): (number | null)[][] {
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  // getDay(): domingo = 0; se desplaza para que lunes = 0.
  const huecos = (new Date(anio, mes, 1).getDay() + 6) % 7;

  const celdas: (number | null)[] = [];
  for (let i = 0; i < huecos; i++) celdas.push(null);
  for (let dia = 1; dia <= diasEnMes; dia++) celdas.push(dia);
  while (celdas.length % 7 !== 0) celdas.push(null);

  const filas: (number | null)[][] = [];
  for (let i = 0; i < celdas.length; i += 7) filas.push(celdas.slice(i, i + 7));
  return filas;
}

/** Mes anterior/siguiente, saltando de año cuando toca. */
export function sumarMeses(
  anio: number,
  mes: number,
  delta: number
): { anio: number; mes: number } {
  const fecha = new Date(anio, mes + delta, 1);
  return { anio: fecha.getFullYear(), mes: fecha.getMonth() };
}

/** Lee la hora de una fecha en formato de carrusel (1-12 + a.m./p.m.). */
export function parteDeHora(fecha: Date): {
  hora12: number;
  minutos: number;
  meridiano: Meridiano;
} {
  const hora24 = fecha.getHours();
  return {
    hora12: hora24 % 12 === 0 ? 12 : hora24 % 12,
    minutos: fecha.getMinutes(),
    meridiano: hora24 < 12 ? 'a.m.' : 'p.m.',
  };
}

/** Arma una fecha con año/mes/día de `fecha` y la hora elegida en el carrusel. */
export function conHora(fecha: Date, hora12: number, minutos: number, meridiano: Meridiano): Date {
  const resultado = new Date(fecha.getTime());
  const hora24 = meridiano === 'a.m.' ? hora12 % 12 : (hora12 % 12) + 12;
  resultado.setHours(hora24, minutos, 0, 0);
  return resultado;
}

/** Combina el día de `fecha` con la hora de `hora` (los dos en hora local). */
export function combinarFechaYHora(fecha: Date, hora: Date): Date {
  const resultado = new Date(fecha.getTime());
  resultado.setHours(hora.getHours(), hora.getMinutes(), 0, 0);
  return resultado;
}

/** Opciones del carrusel. */
export function opcionesHoras(): number[] {
  return Array.from({ length: 12 }, (_, i) => i + 1);
}

/**
 * Las 12 horas en orden cronológico dentro de cada meridiano: 12 a.m. es
 * medianoche y 12 p.m. es mediodía, así que el 12 va primero.
 */
export const ORDEN_HORAS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** Minutos de 5 en 5, como en la referencia de diseño. */
export function opcionesMinutos(paso = 5): number[] {
  const valores: number[] = [];
  for (let m = 0; m < 60; m += paso) valores.push(m);
  return valores;
}

/** Índice de la opción más cercana para colocar el carrusel. */
export function indiceMasCercano(opciones: number[], valor: number): number {
  let mejor = 0;
  let distancia = Number.POSITIVE_INFINITY;
  opciones.forEach((opcion, indice) => {
    const d = Math.abs(opcion - valor);
    if (d < distancia) {
      distancia = d;
      mejor = indice;
    }
  });
  return mejor;
}

/** Una hora del carrusel (lo que el usuario ve: hora, minutos y meridiano). */
export interface SeleccionHora {
  hora12: number;
  minutos: number;
  meridiano: Meridiano;
}

/**
 * ¿Esa hora, en ese día, todavía no pasó?
 *
 * Es el bloqueo de coherencia: si hoy son las 11:15 a.m., las 11:00 a.m. de hoy
 * no se pueden elegir. Para un día futuro cualquier hora vale.
 */
export function esCombinacionValida(
  fecha: Date,
  seleccion: SeleccionHora,
  ahora: Date = new Date()
): boolean {
  const momento = conHora(fecha, seleccion.hora12, seleccion.minutos, seleccion.meridiano);
  return momento.getTime() > ahora.getTime();
}

/**
 * Deja la selección en una hora que sí se puede usar: si la elegida ya pasó,
 * devuelve la primera válida (el siguiente tramo de 5 minutos). Si ya era
 * válida, la devuelve igual.
 */
export function normalizarSeleccion(
  fecha: Date,
  seleccion: SeleccionHora,
  ahora: Date = new Date()
): SeleccionHora {
  if (esCombinacionValida(fecha, seleccion, ahora)) return seleccion;

  for (const meridiano of ['a.m.', 'p.m.'] as Meridiano[]) {
    for (const hora12 of ORDEN_HORAS_12) {
      for (const minutos of opcionesMinutos()) {
        const candidato: SeleccionHora = { hora12, minutos, meridiano };
        if (esCombinacionValida(fecha, candidato, ahora)) return candidato;
      }
    }
  }
  return seleccion; // no queda nada válido ese día (no debería ocurrir)
}

/** Lo mismo, partiendo de una hora ya armada: devuelve la hora utilizable. */
export function horaCoherente(fecha: Date, hora: Date, ahora: Date = new Date()): Date {
  const partes = parteDeHora(hora);
  const ajustada = normalizarSeleccion(fecha, partes, ahora);
  return conHora(fecha, ajustada.hora12, ajustada.minutos, ajustada.meridiano);
}

/**
 * El primer momento agendable de ese día: ahora mismo si es un día futuro, y
 * para hoy, el siguiente tramo de 5 minutos (lo que se muestra como
 * "hoy, solo desde las ...").
 */
export function primerInstanteValido(fecha: Date, ahora: Date = new Date()): Date {
  const candidatos = ORDEN_HORAS_12.flatMap((hora12) =>
    (['a.m.', 'p.m.'] as Meridiano[]).flatMap((meridiano) =>
      opcionesMinutos().map((minutos) => conHora(fecha, hora12, minutos, meridiano))
    )
  );
  const futuros = candidatos.filter((momento) => momento.getTime() > ahora.getTime());
  if (futuros.length === 0) return new Date(fecha.getTime()); // día sin horas disponibles
  return futuros.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b));
}
