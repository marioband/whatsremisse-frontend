/**
 * La hora que va en la tarjeta de un grupo (o de un chat), al estilo WhatsApp (23-09-2026).
 *
 * El usuario lo pidió con una captura: a la derecha de la tarjeta, la hora del último mensaje. La
 * regla es la de WhatsApp y se escribe a mano —sin `toLocaleTimeString`— para que en el teléfono, en
 * el navegador y en las pruebas salga EXACTAMENTE lo mismo (los formatos del sistema cambian de una
 * plataforma a otra: unos ponen «a. m.» y otros «AM»).
 *
 *   * hoy            → «2:34 p. m.»
 *   * ayer           → «ayer»
 *   * últimos 6 días → el día de la semana («lunes»)
 *   * este año       → «12/09»
 *   * más viejo      → «12/09/25»
 *
 * Es una función pura: recibe el momento y, opcionalmente, «ahora» (así se puede probar sin depender
 * del reloj de la máquina).
 */

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** El mismo día del calendario (hora local). */
function esElMismoDia(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** «2:34 p. m.» — 12 horas con dos dígitos en los minutos. */
export function horaCorta(cuando: Date): string {
  const horas24 = cuando.getHours();
  const horas = horas24 % 12 === 0 ? 12 : horas24 % 12;
  const minutos = String(cuando.getMinutes()).padStart(2, '0');
  const sufijo = horas24 < 12 ? 'a. m.' : 'p. m.';
  return `${horas}:${minutos} ${sufijo}`;
}

export function horaDelUltimoMensaje(
  cuando: number | null | undefined,
  ahora: Date = new Date()
): string {
  if (cuando === null || cuando === undefined || !Number.isFinite(cuando)) return '';
  const fecha = new Date(cuando);
  if (Number.isNaN(fecha.getTime())) return '';

  if (esElMismoDia(fecha, ahora)) return horaCorta(fecha);

  const ayer = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 1);
  if (esElMismoDia(fecha, ayer)) return 'ayer';

  // Dentro de la última semana, el día de la semana (la diferencia se mide en días de calendario,
  // no en horas: a las 00:10, algo de anteayer a las 23:50 son dos días).
  const diasDeDiferencia = Math.round(
    (new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime() -
      new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()).getTime()) /
      86400000
  );
  if (diasDeDiferencia > 1 && diasDeDiferencia <= 6) return DIAS[fecha.getDay()];

  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  if (fecha.getFullYear() === ahora.getFullYear()) return `${dia}/${mes}`;
  return `${dia}/${mes}/${String(fecha.getFullYear()).slice(-2)}`;
}
