/**
 * Resolución del nombre del proveedor de un servicio (con caché de sesión).
 *
 * La regla de qué nombre va está en `lib/nombreDelProveedor.ts` (puro). Aquí vive la
 * única parte con entrada/salida: leer el perfil del proveedor con la función
 * `public_profile` de la migración 0005 —la vía autorizada para datos de otro
 * usuario— y recordar el resultado para no repetir la llamada por cada tarjeta.
 */

import { fetchPublicProfile } from './database';
import { nombreDelProveedorDesdeElPerfil } from './nombreDelProveedor';

/** Nombres ya resueltos en esta sesión (una llamada por proveedor, no por tarjeta). */
const nombresResueltos = new Map<string, string>();

/** Olvida la caché de nombres (pruebas y cambios de cuenta). */
export function olvidarNombresDeProveedores(): void {
  nombresResueltos.clear();
}

/**
 * El nombre ya resuelto, SIN esperar a la red ('' si todavía no se sabe).
 *
 * Lo usa el hook de la tarjeta como valor inicial: si la tarjeta se vuelve a montar
 * (por ejemplo al re-renderizarse la pantalla del chat), el nombre correcto se pinta
 * en el primer fotograma en vez de aparecer el respaldo "Proveedor" y cambiarse un
 * instante después. Ese cambio era el parpadeo que reportó el usuario.
 */
export function nombreDelProveedorEnCache(providerId?: string | null): string {
  if (!providerId) return '';
  return nombresResueltos.get(providerId) ?? '';
}

/**
 * Nombre del proveedor de un servicio, con caché de sesión. Devuelve '' si no se pudo
 * averiguar (sin permisos, sin datos o sin conexión): nunca inventa un nombre.
 */
export async function resolverNombreDelProveedor(providerId?: string | null): Promise<string> {
  if (!providerId) return '';
  const enCache = nombresResueltos.get(providerId);
  if (enCache !== undefined) return enCache;

  try {
    const resultado = await fetchPublicProfile(providerId);
    const nombre = resultado.found ? nombreDelProveedorDesdeElPerfil(resultado.profile) : '';
    if (nombre) nombresResueltos.set(providerId, nombre);
    return nombre;
  } catch {
    return '';
  }
}
