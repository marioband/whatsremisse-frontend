/**
 * Palomitas (confirmación de lectura) de los dos chats: la misma regla que
 * WhatsApp, con lo que se fijó con el usuario:
 *
 *   * Palomita tenue = el mensaje se envió (ya está guardado en la base).
 *   * Doble palomita blanca = **todos** los demás participantes lo leyeron.
 *   * Relojito mientras el mensaje todavía no está guardado.
 *   * Las palomitas son SOLO de los mensajes propios (en los del otro no se
 *     pinta nada, igual que en WhatsApp).
 *   * Nunca se dice "leído" si no se sabe quiénes son los demás participantes:
 *     en ese caso queda la palomita simple.
 *
 * Módulo PURO (solo depende de `idSinGuardar`): las reglas se ejecutan con node.
 * El dibujo está en `components/chat/Palomas.tsx`.
 */

import { idSinGuardar } from './mensajes';

export type EstadoDePalomas = 'ENVIANDO' | 'ENVIADO' | 'LEIDO';

/** Aviso de pantalla cuando falta la migración de las palomitas. */
export const AVISO_MIGRACION_0020 =
  'Para ver quién leyó los mensajes (palomitas) falta aplicar la migración 0020 ' +
  '(supabase/migrations/0020_confirmacion_de_lectura.sql) en Supabase Studio.';

/** Marca de lectura de un participante (tabla `*_chat_reads`, migración 0020). */
export interface LecturaDeChat {
  user_id: string;
  last_read_at: string;
}

export interface ContextoDePalomas {
  /** ¿El mensaje lo escribí yo? Las palomitas solo van en los míos. */
  esMio: boolean;
  /** Ids de los DEMÁS participantes de la conversación (sin mí). */
  participantes: string[];
  /** Hasta cuándo leyó cada participante (lo pone la base). */
  lecturas: LecturaDeChat[];
  /**
   * ¿Hay base compartida? Cuando el chat vive solo en este dispositivo ( falta la
   * migración 0010) ningún mensaje se va a confirmar nunca: se pinta la palomita
   * en vez de un reloj eterno.
   */
  hayBase?: boolean;
}

/**
 * Estado de un mensaje para pintar las palomitas (o `null` si no lleva ninguna).
 */
export function estadoDePalomas(
  mensaje: { id: string; created_at: string; type?: string },
  contexto: ContextoDePalomas
): EstadoDePalomas | null {
  if (!contexto.esMio) return null;
  if (mensaje.type === 'SYSTEM') return null;

  if (idSinGuardar(mensaje.id)) {
    return contexto.hayBase === false ? 'ENVIADO' : 'ENVIANDO';
  }

  const otros = Array.from(
    new Set(contexto.participantes.filter((id) => typeof id === 'string' && id.length > 0))
  );
  // Sin saber quiénes son los demás no se puede afirmar que leyeron todos.
  if (otros.length === 0) return 'ENVIADO';

  const creado = new Date(mensaje.created_at).getTime();
  if (!Number.isFinite(creado)) return 'ENVIADO';

  const leidoPorTodos = otros.every((participante) => {
    const fila = contexto.lecturas.find((lectura) => lectura.user_id === participante);
    if (!fila) return false;
    const leido = new Date(fila.last_read_at).getTime();
    return Number.isFinite(leido) && leido >= creado;
  });

  return leidoPorTodos ? 'LEIDO' : 'ENVIADO';
}
