/**
 * Las reglas de «Mis grupos en vivo» (20-09-2026), sin React ni Supabase, para poder probarlas.
 *
 * Vive aparte de `hooks/useRealtimeMisGrupos` porque es donde está la decisión de verdad: qué
 * mensaje obliga a releer el contador de sin leer y el orden de los grupos. Lo demás (la
 * suscripción) es fontanería.
 */

/** Un mensaje que acaba de entrar, tal como llega por tiempo real. */
export interface MensajeEntrante {
  group_id?: string | null;
  sender_id?: string | null;
}

/**
 * ¿Este mensaje obliga a refrescar «Mis grupos»?
 *
 * No lo hace cuando:
 *   - es MÍO: el contador de la base tampoco cuenta lo que escribo yo, y el orden se mueve con lo
 *     RECIBIDO (escribir tú no sube el grupo de sitio);
 *   - es de un grupo que no es mío (con muchos grupos la suscripción va sin filtro, así que aquí
 *     se descarta lo ajeno).
 */
export function mensajeCuentaParaActualizar(
  mensaje: MensajeEntrante | null | undefined,
  miId: string | null | undefined,
  misGrupos: ReadonlySet<string> | readonly string[]
): boolean {
  const grupo = (mensaje?.group_id ?? '').trim();
  if (!grupo) return false;
  if (miId && mensaje?.sender_id === miId) return false;
  const suyos = Array.isArray(misGrupos)
    ? new Set(misGrupos as readonly string[])
    : (misGrupos as ReadonlySet<string>);
  return suyos.has(grupo);
}

/**
 * POR QUÉ NO HAY FILTRO EN LA SUSCRIPCIÓN: este proyecto solo ha usado filtros `eq.` de Supabase
 * Realtime; un `in.(…)` con todos mis grupos no está probado aquí, y si no lo aceptara la
 * suscripción no llegaría NADA —justo el fallo que el usuario reportó—. Se escucha sin filtro (el
 * RLS del servidor ya limita los mensajes a los grupos a los que pertenezco, que es como funcionan
 * los demás canales de la app) y `mensajeCuentaParaActualizar` descarta aquí lo que no sea mío.
 */
