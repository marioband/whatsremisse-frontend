/**
 * Quién es "el otro" en el chat del servicio y con qué nombre se rotula la pantalla.
 *
 * Regla fijada con el usuario: el título de la cabecera del chat es **el nombre de
 * la contraparte**, centrado, y no cambia nunca (antes era `service.title`, que es
 * el recorrido "origen -> destino", así que al entrar al cuadre parecía cambiar el
 * título de la pantalla).
 *
 *   Conductor mira  → nombre del PROVEEDOR
 *   Proveedor mira  → nombre del CONDUCTOR
 */

export interface NombresDeLaConversacion {
  /** Nombre del proveedor (al conductor le llega por `datos_de_pago_del_proveedor`, 0014). */
  nombreProveedor?: string | null;
  /** Nombre del conductor (al proveedor le llega por `public_profile`, 0005). */
  nombreConductor?: string | null;
}

/** Nombre de la contraparte, o el rótulo del rol si aún no se pudo leer el perfil. */
export function nombreDeLaContraparte(
  soyConductor: boolean,
  nombres: NombresDeLaConversacion
): string {
  const nombre = soyConductor ? nombres.nombreProveedor : nombres.nombreConductor;
  const limpio = (nombre || '').trim();
  if (limpio) return limpio;
  // Nunca se inventa un nombre: si el perfil aún no llegó, se dice el rol.
  return soyConductor ? 'Proveedor' : 'Conductor';
}

/** Rótulo secundario de la cabecera: el rol de la contraparte. */
export function rolDeLaContraparte(soyConductor: boolean): string {
  return soyConductor ? 'Proveedor' : 'Conductor';
}
