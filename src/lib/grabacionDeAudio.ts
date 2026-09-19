/**
 * Grabar notas de voz en el chat (pedido del usuario, 19-09-2026: «el icono de micrófono no
 * está funcionando, la función debe ser igual que la de WhatsApp: presionar para hablar,
 * presionar y subir para hablar sin presionar, y opción de cancelar o pausar la grabación»).
 *
 * Antes no existía: el botón del micrófono mandaba un texto inventado («🎤 Nota de voz
 * (0:03)») y un aviso diciendo que se había enviado una nota de 3 segundos. Ahora se graba de
 * verdad con el micrófono del teléfono (`MediaRecorder`, en el navegador; la app publicada es
 * web) y el audio se sube al mismo almacén que las fotos.
 *
 * Decisiones que importan:
 *   - **El formato se elige según lo que soporte el navegador**: Safari (iPhone) graba `audio/mp4`
 *     y Chrome `audio/webm`; pedirle a Safari webm lo deja sin grabar.
 *   - **La duración NO cuenta las pausas**: se acumula por tramos, así el número que se enseña es
 *     el del audio que se sube.
 *   - `cancelar()` no sube nada y suelta el micrófono (si no, el punto rojo del navegador se queda).
 */
import { Platform } from 'react-native';

import type { Resultado } from './adjuntos';

/** Lo grabado, listo para subir. */
export interface Grabacion {
  blob: Blob;
  /** Tipo del contenedor, tal como lo reportó el navegador (`audio/mp4`, `audio/webm`…). */
  tipo: string;
  duracionMs: number;
}

export interface Grabadora {
  /** ¿Está en pausa? */
  enPausa(): boolean;
  /** Milisegundos grabados de verdad (sin contar las pausas). */
  transcurridoMs(): number;
  pausar(): void;
  reanudar(): void;
  /** Termina y devuelve el audio (null si no se grabó nada). */
  detener(): Promise<Grabacion | null>;
  /** Termina y tira lo grabado. */
  cancelar(): void;
}

const SIN_GRABADORA =
  'Este dispositivo no deja grabar audio desde la app. Prueba con el teléfono (no con una vista previa).';

/** ¿Se puede grabar aquí? (web con MediaRecorder y micrófono). */
export function grabadoraDisponible(): boolean {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined') return false;
  const tieneMediaRecorder = typeof (window as any).MediaRecorder !== 'undefined';
  const tieneMicrofono = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  return tieneMediaRecorder && tieneMicrofono;
}

/** El primer formato que el navegador acepte (Safari: mp4; Chrome/Android: webm). */
function mejorFormato(): string | undefined {
  const candidatos = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
  const MR = (window as any).MediaRecorder;
  if (!MR || typeof MR.isTypeSupported !== 'function') return undefined;
  return candidatos.find((tipo) => MR.isTypeSupported(tipo));
}

/**
 * Pide el micrófono y deja todo listo para grabar. El permiso se pide AQUÍ (al mantener
 * pulsado el micrófono), no al abrir el chat.
 */
export async function empezarAGrabar(): Promise<Resultado<Grabadora>> {
  if (!grabadoraDisponible()) return { ok: false, motivo: SIN_GRABADORA };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const tipo = mejorFormato();
    const MediaRecorderCtor = (window as any).MediaRecorder;
    const grabadora = tipo
      ? new MediaRecorderCtor(stream, { mimeType: tipo })
      : new MediaRecorderCtor(stream);

    const trozos: Blob[] = [];
    let acumuladoMs = 0;
    let desdeMs = Date.now();
    let enPausa = false;
    let terminada = false;

    grabadora.ondataavailable = (evento: any) => {
      if (evento.data && evento.data.size > 0) trozos.push(evento.data);
    };

    const transcurrido = () => acumuladoMs + (enPausa ? 0 : Date.now() - desdeMs);

    const soltarMicrofono = () => {
      stream.getTracks().forEach((pista: MediaStreamTrack) => pista.stop());
    };

    grabadora.start();

    const cerrar = () =>
      new Promise<void>((resolver) => {
        if (terminada) {
          resolver();
          return;
        }
        terminada = true;
        grabadora.onstop = () => {
          if (!enPausa) acumuladoMs += Date.now() - desdeMs;
          soltarMicrofono();
          resolver();
        };
        try {
          grabadora.stop();
        } catch {
          soltarMicrofono();
          resolver();
        }
      });

    return {
      ok: true,
      valor: {
        enPausa: () => enPausa,
        transcurridoMs: transcurrido,
        pausar: () => {
          if (enPausa || terminada) return;
          try {
            grabadora.pause();
          } catch {
            return;
          }
          acumuladoMs += Date.now() - desdeMs;
          enPausa = true;
        },
        reanudar: () => {
          if (!enPausa || terminada) return;
          try {
            grabadora.resume();
          } catch {
            return;
          }
          desdeMs = Date.now();
          enPausa = false;
        },
        detener: async () => {
          const duracionMs = transcurrido();
          await cerrar();
          if (trozos.length === 0) return null;
          return {
            blob: new Blob(trozos, { type: tipo || trozos[0].type || 'audio/webm' }),
            tipo: tipo || trozos[0].type || 'audio/webm',
            duracionMs,
          };
        },
        cancelar: () => {
          trozos.length = 0;
          void cerrar();
        },
      },
    };
  } catch (err) {
    const mensaje = (err as { message?: string })?.message || '';
    const sinPermiso = /permission|denied|notallowed/i.test(mensaje);
    return {
      ok: false,
      motivo: sinPermiso
        ? 'La app necesita permiso para usar el micrófono. Actívalo en los ajustes del navegador o del teléfono.'
        : `No se pudo usar el micrófono: ${mensaje || 'error desconocido'}`,
    };
  }
}

/** «1:07»: la duración como la enseña WhatsApp. */
export function duracionEnTexto(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutos = Math.floor(total / 60);
  const segundos = total % 60;
  return `${minutos}:${String(segundos).padStart(2, '0')}`;
}
