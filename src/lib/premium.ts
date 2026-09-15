import { SubscriptionTier } from '../types';

/**
 * Membresía (premium).
 *
 * Reglas de esta etapa: todavía no existe el panel de administración, así que
 * TODAS las cuentas valen como premium mientras `PREMIUM_PARA_TODOS` esté en
 * true. Cuando el panel exista, se apaga esta bandera y manda la columna
 * `profiles.tier` (migración 0008), que el administrador activa por usuario.
 */
export const PREMIUM_PARA_TODOS = true;

/** Días que dura la membresía cuando se activa desde el panel. */
export const DIAS_DE_MEMBRESIA = 30;

export interface PerfilMembresia {
  tier?: SubscriptionTier | string | null;
  subscription_expires_at?: string | null;
}

export type EstadoPremium = 'activa' | 'sin-premium' | 'vencida' | 'sin-dato';

export interface Membresia {
  premium: boolean;
  estado: EstadoPremium;
  /** Fecha de vencimiento, si la tiene. */
  vence: Date | null;
  /** Días que quedan (null si no vence). */
  diasRestantes: number | null;
}

const MS_DIA = 24 * 60 * 60 * 1000;

/**
 * Estado de la membresía de un perfil.
 *
 * - `tier` distinto de PREMIUM -> 'sin-premium'
 * - PREMIUM con vencimiento pasado -> 'vencida'
 * - PREMIUM sin vencimiento o con fecha futura -> 'activa'
 *
 * Mientras la etapa de pruebas esté activa, cualquier cuenta sin dato de
 * membresía cuenta como activa (y se informa como 'sin-dato').
 */
export function membresiaDe(
  perfil: PerfilMembresia | null | undefined,
  ahora: Date = new Date()
): Membresia {
  if (!perfil || !perfil.tier) {
    return {
      premium: PREMIUM_PARA_TODOS,
      estado: PREMIUM_PARA_TODOS ? 'sin-dato' : 'sin-premium',
      vence: null,
      diasRestantes: null,
    };
  }

  const tier = String(perfil.tier).toUpperCase();
  if (tier !== 'PREMIUM') {
    return { premium: false, estado: 'sin-premium', vence: null, diasRestantes: null };
  }

  const vence = perfil.subscription_expires_at ? new Date(perfil.subscription_expires_at) : null;
  if (vence && vence.getTime() <= ahora.getTime()) {
    return { premium: false, estado: 'vencida', vence, diasRestantes: 0 };
  }

  const diasRestantes = vence ? Math.ceil((vence.getTime() - ahora.getTime()) / MS_DIA) : null;
  return { premium: true, estado: 'activa', vence, diasRestantes };
}

/** Atajo: ¿esta cuenta puede usar las funciones premium? */
export function esPremium(perfil: PerfilMembresia | null | undefined): boolean {
  return membresiaDe(perfil).premium;
}

/** Texto corto para la pantalla, en español. */
export function textoDeMembresia(membresia: Membresia): string {
  switch (membresia.estado) {
    case 'activa':
      return membresia.diasRestantes === null
        ? 'Premium activo'
        : `Premium: ${membresia.diasRestantes} día(s) restantes`;
    case 'vencida':
      return 'Premium vencido';
    case 'sin-dato':
      return 'Premium (etapa de pruebas)';
    default:
      return 'Cuenta gratuita';
  }
}

/** A qué funciones da acceso cada plan: se muestra en la interfaz. */
export const FUNCIONES_PREMIUM = [
  'Sugerencias de dirección al escribir (autocompletado)',
  'Distancia y tiempo del conductor al origen y del origen al destino',
] as const;
