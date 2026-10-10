/**
 * Movimiento: las duraciones de la casa y el respeto del ajuste del teléfono (10-10-2026).
 *
 * Reglas:
 *   - Las duraciones se nombran (`MOVIMIENTO.rapida/media/lenta`) y salen de aquí, no de
 *     cada componente. Rápido para responder a un toque, medio para un panel, lento para
 *     lo grande; siempre por debajo de ~300 ms para que la app se sienta inmediata.
 *   - Si el sistema pide MENOS movimiento (iPhone/Android: Accesibilidad → Reducir
 *     movimiento; navegador: `prefers-reduced-motion`), `useMovimientoReducido()` lo dice
 *     y `duracionMovimiento(base, reducido)` devuelve 0: la acción ocurre igual, sin el
 *     viaje animado.
 *   - react-native-web ya implementa la detección (verificado en su fuente el 10-10-2026:
 *     `isReduceMotionEnabled` + `addEventListener`) y en nativo la da `AccessibilityInfo`.
 *     No hace falta ninguna librería nueva.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Duraciones en milisegundos. */
export const MOVIMIENTO = { rapida: 140, media: 200, lenta: 280 } as const;

/** La duración a usar: 0 cuando el sistema pide menos movimiento (la acción no se pierde). */
export function duracionMovimiento(base: number, reducido: boolean): number {
  return reducido ? 0 : base;
}

let valorConocido: boolean | null = null;
const oyentes = new Set<(valor: boolean) => void>();

function avisar(valor: boolean): void {
  valorConocido = valor;
  oyentes.forEach((oyente) => oyente(valor));
}

let suscripto = false;

function suscribir(): void {
  if (suscripto) return;
  suscripto = true;
  const api = AccessibilityInfo as unknown as {
    isReduceMotionEnabled?: () => Promise<boolean>;
    addEventListener?: (evento: string, fn: (valor: boolean) => void) => unknown;
    addChangeListener?: (fn: (valor: boolean) => void) => unknown;
  };
  try {
    const inicial = api.isReduceMotionEnabled?.();
    if (inicial && typeof inicial.then === 'function') {
      inicial.then(avisar).catch(() => {});
    }
    if (typeof api.addEventListener === 'function') {
      api.addEventListener('reduceMotionChanged', avisar);
    } else if (typeof api.addChangeListener === 'function') {
      api.addChangeListener(avisar);
    }
  } catch {
    // Si el entorno no lo soporta, se queda en "sin preferencia" (false): nada se rompe.
  }
}

/**
 * ¿El sistema pide menos movimiento? Se resuelve una sola vez por app y se actualiza en
 * vivo si el usuario cambia el ajuste con la aplicación abierta.
 */
export function useMovimientoReducido(): boolean {
  const [reducido, setReducido] = useState(valorConocido ?? false);

  useEffect(() => {
    oyentes.add(setReducido);
    suscribir();
    if (valorConocido !== null) setReducido(valorConocido);
    return () => {
      oyentes.delete(setReducido);
    };
  }, []);

  return reducido;
}
