/**
 * Cuándo el tráfico cambia DE VERDAD un tiempo de viaje (decisión del usuario, 24-09-2026).
 *
 * Lo preguntó así: «¿hay forma de manejarlo en básica pero con variación acercada a la realidad en
 * las horas punta de alto tránsito?». La respuesta que se implementó: se pide a Google la tarifa
 * **barata** (`TRAFFIC_UNAWARE`, categoría Essentials: $5 por 1.000, 10.000 gratis) **fuera** de las
 * horas punta, y la de **tráfico real** (`TRAFFIC_AWARE`, Pro: $10 por 1.000, 5.000 gratis) dentro.
 *
 * Por qué así y no un factor multiplicador inventado: fuera de punta el tiempo sin tráfico ES la
 * realidad (a las 3 de la mañana no hay atasco), así que el número que ve el conductor sigue siendo
 * una MEDIDA, no una estimación con un multiplicador. Y donde el tráfico decide (punta), el dato es
 * el real.
 *
 * Las franjas son de Lima y están en UNA tabla: ajustarlas es cambiar estos números.
 */
export interface Franja {
  /** Minutos desde medianoche (7:30 → 450). */
  desde: number;
  hasta: number;
}

const H = (horas: number, minutos = 0): number => horas * 60 + minutos;

/** Lunes a viernes: la entrada y la salida. */
export const FRANJAS_ENTRE_SEMANA: Franja[] = [
  { desde: H(7), hasta: H(9, 30) },
  { desde: H(17, 30), hasta: H(20, 30) },
];

/** Sábado: la mañana de compras y trámites. */
export const FRANJAS_SABADO: Franja[] = [{ desde: H(11), hasta: H(13, 30) }];

/** Domingo: el tráfico no decide nada, así que no se paga la tarifa con tráfico. */
export const FRANJAS_DOMINGO: Franja[] = [];

export function minutosDelDia(fecha: Date): number {
  return fecha.getHours() * 60 + fecha.getMinutes();
}

/** Las franjas que le tocan a ese día de la semana. */
export function franjasDelDia(fecha: Date): Franja[] {
  if (fecha.getDay() === 0) return FRANJAS_DOMINGO;
  if (fecha.getDay() === 6) return FRANJAS_SABADO;
  return FRANJAS_ENTRE_SEMANA;
}

/** ¿Estamos en una franja en la que el tráfico cambia el tiempo? */
export function esHoraPunta(fecha: Date = new Date()): boolean {
  const minutos = minutosDelDia(fecha);
  return franjasDelDia(fecha).some((franja) => minutos >= franja.desde && minutos < franja.hasta);
}

/**
 * La preferencia de ruta que se le pide a Google en este momento (decide el precio).
 * Punta → tráfico real (Pro) · fuera de punta → básica (Essentials, la mitad).
 */
export function preferenciaDeRuta(fecha: Date = new Date()): 'TRAFFIC_AWARE' | 'TRAFFIC_UNAWARE' {
  return esHoraPunta(fecha) ? 'TRAFFIC_AWARE' : 'TRAFFIC_UNAWARE';
}
