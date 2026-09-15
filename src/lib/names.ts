/**
 * Nombres para mostrar en pantalla.
 *
 * Regla de oro: nunca pintar un identificador técnico (UUID) donde va un
 * nombre. Pasó en la lista de integrantes del grupo: cuando Supabase no
 * devolvía `full_name` (RLS o perfil sin completar) la app caía al `user_id` y
 * la pantalla mostraba "7c944bdf-a63f-4242-9b88-7aaee8a20ff0".
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_ID_RE = /^[0-9a-f]{16,}$/i;

/** ¿El texto es un identificador técnico en vez de un nombre? */
export function looksLikeId(value?: string | null): boolean {
  if (!value) return false;
  const v = value.trim();
  return UUID_RE.test(v) || HEX_ID_RE.test(v);
}

/**
 * Primer candidato que sirva como nombre (no vacío y que no sea un id).
 * El orden de `candidates` importa: de la fuente más fiable a la menos.
 */
export function displayName(
  candidates: (string | null | undefined)[],
  fallback = 'Integrante'
): string {
  for (const candidate of candidates) {
    const value = (candidate || '').trim();
    if (value && !looksLikeId(value)) return value;
  }
  return fallback;
}

/** Letra del avatar: nunca la primera letra de un UUID. */
export function initialOf(name?: string | null): string {
  const value = (name || '').trim();
  if (!value || looksLikeId(value)) return '?';
  return value.charAt(0).toUpperCase();
}

const ROLE_LABELS: Record<string, string> = {
  GROUP_OWNER: 'Propietario de grupo',
  ADMIN: 'Administrador',
  PROVIDER: 'Proveedor',
  DRIVER: 'Conductor',
};

/** Texto legible para el rol de `profiles.role` (que llega en mayúsculas). */
export function roleLabel(role?: string | null): string {
  const value = (role || '').trim();
  if (!value) return '';
  return ROLE_LABELS[value.toUpperCase()] || value;
}

const MEMBER_ROLE_LABELS: Record<string, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  member: 'Integrante',
};

/** Texto legible para el rol dentro del grupo (owner/admin/member). */
export function memberRoleLabel(role?: string | null): string {
  const value = (role || '').trim().toLowerCase();
  return MEMBER_ROLE_LABELS[value] || '';
}
