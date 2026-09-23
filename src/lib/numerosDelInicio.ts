/**
 * Los números de los botones y sub botones del inicio (pedido del usuario, 20-09-2026).
 *
 * LO QUE PIDIÓ ENTONCES: «el contador ya no será un globo en la parte superior derecha, ahora estará
 * al lado del texto dentro del botón, por ejemplo “Disponibles 10” o “En proceso 2” … y en los
 * botones debemos dar la suma de ambas: “Conductor 12” … en el caso de Mis grupos, la suma de los
 * mensajes sin leer de todos los grupos».
 *
 * LO QUE CAMBIÓ EL 23-09-2026 (2ª parte, textual del usuario): «los contadores de conductor y
 * proveedor y de los subbotones correspondientes deben mantener la contabilidad hasta que la tarjeta
 * desaparezca, no es como en Mis grupos donde al abrir el grupo el contador pasa a cero. Los
 * contadores indicarán las TARJETAS ACTIVAS que hay en ese momento: así el usuario las haya visto,
 * el contador no baja hasta que la tarjeta desaparezca. Si el contador de Disponibles está en 100 el
 * usuario ingresa a Disponibles y no pasa nada; si el contador está en 100 y una tarjeta desaparece
 * por haber sido cubierto, el contador baja a 99».
 *
 * Es decir: Conductor, Proveedor, Disponibles, En proceso y Publicados son CUENTAS de las tarjetas
 * que hay en la lista en ese momento (lo calcula `useContadoresDelInicio` con las mismas funciones
 * que arman las listas). Mis grupos NO cambia: ahí el número son los mensajes sin leer y al abrir el
 * grupo pasa a cero.
 *
 * Las funciones puras viven aparte para poder comprobarlas con node sin navegador ni React.
 */

/** El número del botón de arriba: la suma de sus dos apartados. */
export function sumaDeNumeros(...numeros: number[]): number {
  return numeros.reduce((total, n) => total + (Number.isFinite(n) && n > 0 ? n : 0), 0);
}

/** Cómo se enseña un contador grande (mismo tope que el globo que había antes). */
export function numeroDelBoton(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  return n > 99 ? '99+' : String(n);
}

/**
 * El texto del botón: «Disponibles 10»; sin tarjetas, solo «Disponibles» (sin espacios de más).
 * Va en UN solo texto, como pidió el usuario (al lado del texto, no un globo encima).
 */
export function textoDelBoton(etiqueta: string, numero: number): string {
  const cifra = numeroDelBoton(numero);
  return cifra ? `${etiqueta} ${cifra}` : etiqueta;
}
