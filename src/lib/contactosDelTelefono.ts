/**
 * Compartir un contacto del teléfono en el chat (pedido del usuario, 20-09-2026).
 *
 * «La idea es que se abra la lista de contactos que tiene el usuario en su celular y pueda
 * seleccionar algún contacto de ellos para compartirlo en el chat.»
 *
 * LO QUE SE PUEDE Y LO QUE NO (comprobado antes de escribir esto):
 *   - Chrome de Android SÍ tiene `navigator.contacts.select(...)` (Contact Picker API): abre la
 *     lista de contactos del teléfono y devuelve los elegidos. Es la vía que se usa aquí cuando el
 *     navegador la tiene.
 *   - Safari de iPhone NO la tiene (ni la tendrá: Apple no permite que una web lea la agenda), así
 *     que en el iPhone la lista de contactos no se puede abrir DESDE la app. Ahí queda escribir el
 *     nombre y el teléfono a mano y enviarlo como tarjeta. No es un fallo de la app: es el sistema.
 *
 * Las funciones puras (normalizar y los textos) van aparte para poder comprobarlas con node.
 */
export interface ContactoCompartido {
  nombre: string;
  telefono: string;
}

export type MotivoSinContacto = 'sin-soporte' | 'cancelado' | 'sin-datos' | 'fallo';

export type ResultadoContacto =
  { ok: true; valor: ContactoCompartido } | { ok: false; motivo: MotivoSinContacto };

/** ¿Este navegador deja abrir la lista de contactos del teléfono? */
export function haySelectorDeContactos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const contacts = (navigator as { contacts?: { select?: unknown } }).contacts;
  return Boolean(contacts && typeof contacts.select === 'function');
}

/** El primer valor de lo que devuelve el navegador (viene como array de arrays). */
function primerValor(valor: unknown): string {
  if (Array.isArray(valor)) return String(valor[0] ?? '');
  return typeof valor === 'string' ? valor : '';
}

/**
 * Lo que devuelve el navegador → un contacto usable. Devuelve null si no trae nada con lo que
 * armar una tarjeta (ni nombre ni teléfono).
 */
export function normalizarContacto(crudo: unknown): ContactoCompartido | null {
  if (!crudo || typeof crudo !== 'object') return null;
  const fila = crudo as { name?: unknown; tel?: unknown };
  const nombre = primerValor(fila.name).replace(/\s+/g, ' ').trim();
  const telefono = primerValor(fila.tel).trim();
  if (!nombre && !telefono) return null;
  // Sin nombre, se usa el teléfono como título: la tarjeta nunca queda vacía.
  return { nombre: nombre || telefono, telefono };
}

/** Abre la lista de contactos del teléfono. Solo en los navegadores que la tienen. */
export async function elegirContactoDelTelefono(): Promise<ResultadoContacto> {
  if (!haySelectorDeContactos()) return { ok: false, motivo: 'sin-soporte' };
  try {
    const contacts = (
      navigator as unknown as {
        contacts: { select: (props: string[], opciones?: object) => Promise<unknown> };
      }
    ).contacts;
    const elegidos = await contacts.select(['name', 'tel'], { multiple: false });
    const contacto = normalizarContacto(Array.isArray(elegidos) ? elegidos[0] : elegidos);
    if (!contacto) return { ok: false, motivo: 'sin-datos' };
    return { ok: true, valor: contacto };
  } catch (err) {
    // Cerrar el selector sin elegir lanza AbortError: eso no es un fallo, no se avisa.
    const nombre = (err as { name?: string } | null)?.name;
    return { ok: false, motivo: nombre === 'AbortError' ? 'cancelado' : 'fallo' };
  }
}

/** El texto del mensaje: el nombre del contacto (es lo que se ve en la lista y en el aviso). */
export function textoDelContacto(contacto: ContactoCompartido): string {
  return contacto.nombre.trim() || contacto.telefono.trim() || 'Contacto';
}

/** El mensaje que se manda cuando NO hay nombre: no se inventa, se dice lo que hay. */
export function avisoSinNombre(contacto: ContactoCompartido): string | null {
  return contacto.nombre.trim()
    ? null
    : 'El contacto no tiene nombre guardado: se comparte con su teléfono.';
}
