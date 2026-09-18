/**
 * La búsqueda de texto de las pantallas (la lupa).
 *
 * Una sola forma de comparar en toda la app: sin acentos ni mayúsculas, para que "jose"
 * encuentre "José" y "LIMA" encuentre "Lima". Vive aquí, sin React, porque es una regla
 * del negocio y hay que poder ejecutarla con node.
 *
 * La piden los cinco apartados que el usuario señaló (18-09-2026):
 *   - Conductor → Disponibles y En proceso
 *   - Proveedor → Publicados y En proceso
 *   - Mis grupos
 * Cada uno busca en los campos que SE VEN en su lista: las tarjetas de servicio por
 * proveedor, grupo, título, origen y destino; los grupos por su nombre.
 */
import { ServiceAlert } from '../types';

/** Sin acentos ni mayúsculas, para que "jose" encuentre "José". */
export function normalizar(texto: string): string {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * ¿Alguno de los campos contiene lo que se escribió?
 *
 * Sin consulta (o solo espacios) coincide TODO: la lista se ve completa mientras el campo
 * está vacío, que es lo que se espera al abrir la lupa y todavía no escribir nada.
 */
export function coincideConLaBusqueda(
  consulta: string,
  campos: (string | null | undefined)[]
): boolean {
  const q = normalizar(consulta.trim());
  if (!q) return true;
  return campos.some((campo) => normalizar(campo || '').includes(q));
}

/**
 * Filtra una lista por los campos que muestra cada elemento.
 *
 * Devuelve la MISMA lista (sin copiar) cuando no hay consulta: así los llamadores no
 * pierden la referencia y no se re-renderiza la lista por una búsqueda vacía.
 */
export function filtrarPorBusqueda<T>(
  elementos: readonly T[],
  consulta: string,
  campos: (elemento: T) => (string | null | undefined)[]
): T[] {
  const q = normalizar(consulta.trim());
  if (!q) return elementos as T[];
  return elementos.filter((elemento) => coincideConLaBusqueda(q, campos(elemento)));
}

/**
 * Lo que se busca en la tarjeta de un servicio.
 *
 * Son los textos que el usuario tiene delante: el nombre del proveedor (el mismo que
 * pinta la tarjeta: `provider_name` del formulario o `company_name` del perfil), el
 * grupo por el que le llegó al conductor, el título, el origen, el destino, las paradas
 * y las observaciones. El número de tarjeta no se busca: nadie lo teclea.
 */
export function camposDeBusquedaDeServicio(
  servicio: ServiceAlert,
  grupo?: string | null
): (string | null | undefined)[] {
  return [
    servicio.provider_name,
    servicio.company_name,
    grupo,
    servicio.title,
    servicio.description,
    servicio.origin_address,
    servicio.destination_address,
    ...(servicio.observations || []),
  ];
}

/** Lo que se busca en la tarjeta de un grupo. */
export function camposDeBusquedaDeGrupo(grupo: {
  name?: string;
  description?: string | null;
}): (string | null | undefined)[] {
  return [grupo.name, grupo.description];
}
