/**
 * Billeteras y bancos de los datos de pago (pedido del usuario, 20-09-2026).
 *
 * «En datos de pago debemos hacer modificaciones, ya que el apartado no deja elegir el tipo de
 * billetera ni el tipo de banco. Billeteras: Yape, Plin, Bim, Otro. Bancos: BCP, Interbank,
 * Scotiabank, Otro. Considera en tu diseño que banco tiene número de cuenta y CCI.»
 *
 * Las DOS listas viven aquí y solo aquí: la pantalla de datos de pago las pinta como botones y el
 * chat las usa para poner el nombre correcto («Número Plin», «Cuenta Interbank») en vez del
 * rótulo genérico de antes («Yape / Plin», «Cuenta bancaria»).
 *
 * Reglas que no se ven:
 *   - En la base, la billetera se guarda como CÓDIGO (`billetera_tipo`: YAPE, PLIN, BIM, OTRO) más
 *     el nombre escrito cuando es «Otro» (`billetera_nombre`), y el banco como NOMBRE
 *     (`banco_nombre`), porque los bancos que se eligen son justo su nombre.
 *   - Los NÚMEROS siguen en las columnas de siempre (`yape_number`, `bcp_account`, `bcp_cci`):
 *     cambiarlas obligaría a tocar las funciones autorizadas que ya leen de ahí, y no hace falta.
 *   - Nada de esto es obligatorio: sin tipo elegido, las etiquetas caen al texto genérico de antes.
 */

/** Billeteras que se pueden elegir. */
export const BILLETERAS = ['Yape', 'Plin', 'Bim', 'Otro'] as const;

/** Bancos que se pueden elegir. */
export const BANCOS = ['BCP', 'Interbank', 'Scotiabank', 'Otro'] as const;

export type Billetera = (typeof BILLETERAS)[number];
export type Banco = (typeof BANCOS)[number];

const normalizar = (texto?: string | null): string => (texto || '').trim().toLowerCase();

/** El código que se guarda en `profiles.billetera_tipo` para una billetera de la lista. */
export function codigoDeBilletera(nombre: string): string | null {
  const buscado = normalizar(nombre);
  if (!buscado) return null;
  const encontrada = BILLETERAS.find((b) => b.toLowerCase() === buscado);
  return encontrada ? encontrada.toUpperCase() : null;
}

/** Qué botón marcar con lo que hay guardado (null si no hay nada que marcar). */
export function chipDeBilletera(
  codigo?: string | null,
  nombrePropio?: string | null
): Billetera | null {
  const buscado = normalizar(codigo);
  if (buscado) {
    const encontrada = BILLETERAS.find((b) => b.toLowerCase() === buscado);
    if (encontrada) return encontrada;
  }
  // Sin código pero con un nombre escrito: es una billetera «Otro».
  return normalizar(nombrePropio) ? 'Otro' : null;
}

/**
 * El nombre de la billetera tal como se enseña: la elegida o, si es «Otro», la que el usuario
 * escribió. Cadena vacía cuando no hay ninguna (las etiquetas caen al texto genérico).
 */
export function nombreDeBilletera(chip?: Billetera | null, nombrePropio?: string | null): string {
  if (chip === 'Otro') return (nombrePropio || '').trim();
  if (chip) return chip;
  return (nombrePropio || '').trim();
}

/** Rótulo del campo del número: «Número Yape», «Número Plin»… y el genérico si no se sabe. */
export function etiquetaDelNumeroDeBilletera(
  chip?: Billetera | null,
  nombrePropio?: string | null
): string {
  const nombre = nombreDeBilletera(chip, nombrePropio);
  return nombre ? `Número ${nombre}` : 'Número de billetera';
}

/** El banco que se guarda en `profiles.banco_nombre` (el elegido o el escrito con «Otro»). */
export function bancoAGuardar(chip?: Banco | null, nombrePropio?: string | null): string {
  if (chip === 'Otro') return (nombrePropio || '').trim();
  return chip || '';
}

/** Qué botón de banco marcar con un nombre guardado (null si no hay ninguno). */
export function chipDeBanco(banco?: string | null): Banco | null {
  const buscado = normalizar(banco);
  if (!buscado) return null;
  const conocido = BANCOS.find((b) => b.toLowerCase() === buscado);
  return conocido ?? 'Otro';
}

/** El nombre del banco guardado, tal cual (cadena vacía si no hay). */
export function nombreDeBanco(banco?: string | null): string {
  return (banco || '').trim();
}

/** Rótulo de la cuenta: «Cuenta Interbank» / «Cuenta bancaria» cuando no se sabe el banco. */
export function etiquetaDeLaCuenta(banco?: string | null): string {
  const nombre = nombreDeBanco(banco);
  return nombre ? `Cuenta ${nombre}` : 'Cuenta bancaria';
}

/** Rótulo del CCI: «CCI Scotiabank» / «CCI» cuando no se sabe el banco. */
export function etiquetaDelCci(banco?: string | null): string {
  const nombre = nombreDeBanco(banco);
  return nombre ? `CCI ${nombre}` : 'CCI';
}

/** Rótulo de la billetera en el chat: «Yape», «Plin»… o el genérico de antes si no se sabe. */
export function etiquetaDeLaBilletera(datos: {
  billeteraTipo?: string | null;
  billeteraNombre?: string | null;
}): string {
  const chip = chipDeBilletera(datos.billeteraTipo, datos.billeteraNombre);
  return nombreDeBilletera(chip, datos.billeteraNombre) || 'Yape / Plin';
}

/**
 * ¿Este banco es uno de los de la lista corta? Sirve para saber si el nombre guardado hay que
 * enseñarlo como un banco conocido o como un «Otro» con nombre propio.
 */
export function esBancoDeLaLista(banco?: string | null): boolean {
  const buscado = normalizar(banco);
  return buscado.length > 0 && BANCOS.some((b) => b.toLowerCase() === buscado && b !== 'Otro');
}
