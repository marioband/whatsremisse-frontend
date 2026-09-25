import { SubscriptionTier } from '../types';

/**
 * Membresía (premium).
 *
 * Quién manda es el INTERRUPTOR DE LA BASE (migración 0046, tabla `platform_settings`):
 *   · `premium_para_todos = true`  → «modo pruebas»: cualquier cuenta vale como premium (como
 *     estaba la app hasta ahora, para poder probar sin activar a nadie).
 *   · `premium_para_todos = false` → «modo real»: manda `profiles.tier`, o sea lo que el
 *     administrador activa cuenta por cuenta desde el panel.
 *
 * La app lee ese interruptor al entrar (`AuthContext` → `configurarModoDePruebasPremium`) y lo deja
 * en esta variable de módulo: así `esPremium(perfil)` sigue siendo una función pura y síncrona, y
 * todas las pantallas que ya la usan no cambian.
 *
 * SI LA MIGRACIÓN NO ESTÁ APLICADA el interruptor no se puede leer y se queda en `true`: la app
 * se comporta como siempre (nadie se queda sin las funciones de pago por una migración que falte).
 */

let modoDePruebasEncendido = true;

/** Lo llama el arranque con lo que dice la base. */
export function configurarModoDePruebasPremium(encendido: boolean): void {
  modoDePruebasEncendido = encendido !== false;
}

/** ¿Está la plataforma en modo pruebas (todos premium)? */
export function modoDePruebasPremium(): boolean {
  return modoDePruebasEncendido;
}

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
  // MODO PRUEBAS (el interruptor de la base): valen como premium TODAS las cuentas, tengan
  // membresía, la tengan vencida o no tengan ninguna. Es como estaba la app hasta ahora, y se
  // informa como «sin-dato» para que la pantalla diga que es la etapa de pruebas y no un premium
  // con fecha. Lo que sí se conserva es la fecha de vencimiento real, por si se quiere enseñar.
  if (modoDePruebasEncendido) {
    const vence = perfil?.subscription_expires_at ? new Date(perfil.subscription_expires_at) : null;
    const dias = vence ? Math.ceil((vence.getTime() - ahora.getTime()) / MS_DIA) : null;
    return {
      premium: true,
      estado: 'sin-dato',
      vence,
      diasRestantes: dias !== null && dias > 0 ? dias : null,
    };
  }

  if (!perfil || !perfil.tier) {
    return { premium: false, estado: 'sin-premium', vence: null, diasRestantes: null };
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
