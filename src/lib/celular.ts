/**
 * El celular con su código de país.
 *
 * POR QUÉ EXISTE (22-09-2026)
 * ---------------------------
 * Al entrar, el número es la identidad Y la contraseña (ver `AuthContext`), así que el formato en
 * que se guarda decide quién puede entrar. Las cuentas creadas antes de esta fecha guardaron el
 * número SIN código (por ejemplo `999888777`); desde ahora se guarda con el código (`+51999888777`).
 *
 * Para que nadie se quede fuera ni se le duplique la cuenta:
 *   - al ENTRAR se prueban todas las formas del número (la nueva primero, las viejas después)
 *     ANTES de crear nada: `candidatosDeCelular`;
 *   - al MOSTRAR (o al copiar los datos) se completa el código si falta, así siempre se lee con él:
 *     `formatoDeCelular`.
 *
 * El código es editable porque la app se usará también fuera del Perú; sin `+` no se adivina país.
 */
export const CODIGO_POR_DEFECTO = '+51';

const SIN_SEPARADORES = /[\s().-]/g;

/** Cuántos dígitos tiene el número local (Perú). Es lo que permite separar el código del número. */
const DIGITOS_DEL_NUMERO = 9;

/**
 * Códigos que se reconocen al leer un número guardado. Solo sirven para partir bien un número que
 * YA trae el `+`; si no se reconoce, se usan los dígitos que sobran del número local.
 */
const CODIGOS_CONOCIDOS = [
  '+591', '+593', '+595', '+598', '+51', '+52', '+54', '+56', '+57', '+58', '+1',
];

/** Separa lo escrito o guardado en código y número. Sin `+` delante no hay código. */
export function partirCelular(valor: string | null | undefined): { codigo: string; numero: string } {
  const limpio = String(valor ?? '').replace(SIN_SEPARADORES, '');
  const digitos = limpio.replace(/\D/g, '');
  if (!limpio.startsWith('+')) return { codigo: '', numero: digitos };
  const conocido = CODIGOS_CONOCIDOS.find((codigo) => digitos.startsWith(codigo.slice(1)));
  if (conocido) return { codigo: conocido, numero: digitos.slice(conocido.length - 1) };
  const sobran = digitos.length - DIGITOS_DEL_NUMERO;
  if (sobran <= 0) return { codigo: `+${digitos}`, numero: '' };
  return { codigo: `+${digitos.slice(0, sobran)}`, numero: digitos.slice(sobran) };
}

/**
 * Cómo se lee y cómo se copia el número: SIEMPRE con el código delante.
 *
 * Es lo que pinta la tarjeta del postulante («Celular») y el texto que copia el proveedor, así que
 * también completa el código de las cuentas viejas en vez de mostrarlas «a medias».
 */
export function formatoDeCelular(
  valor: string | null | undefined,
  codigoPorDefecto: string = CODIGO_POR_DEFECTO
): string {
  const { codigo, numero } = partirCelular(valor);
  if (!numero) return codigo;
  return `${codigo || codigoPorDefecto} ${numero}`;
}

/** El número tal como se manda a la base de cuentas: sin espacios y con el código delante. */
export function celularCompleto(codigo: string | null | undefined, numero: string | null | undefined): string {
  const soloCodigo = String(codigo ?? '').replace(/\D/g, '');
  const soloNumero = String(numero ?? '').replace(/\D/g, '');
  if (!soloNumero) return '';
  return `+${soloCodigo}${soloNumero}`;
}

/**
 * Las formas del número que se prueban al entrar, en orden: primero la nueva (con código) y después
 * las viejas (sin código y sin el `+`), para que una cuenta creada antes del 22-09-2026 siga
 * entrando. La primera de la lista es la que se usa para CREAR una cuenta nueva.
 */
export function candidatosDeCelular(
  escrito: string | null | undefined,
  codigoPorDefecto: string = CODIGO_POR_DEFECTO
): string[] {
  const { codigo, numero } = partirCelular(escrito);
  if (!numero) return [];
  const conCodigo = `${codigo || codigoPorDefecto}${numero}`;
  const sinMas = `${(codigo || codigoPorDefecto).replace('+', '')}${numero}`;
  const talCual = String(escrito ?? '').replace(SIN_SEPARADORES, '');
  return [...new Set([conCodigo, sinMas, numero, talCual].filter((forma) => forma.length > 0))];
}
