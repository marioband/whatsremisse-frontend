/**
 * Quién recibe el aviso y con qué texto.
 *
 * Regla del usuario (18-09-2026): las notificaciones se dan **por cada tarjeta de
 * servicio, por cada proceso del servicio y por cada mensaje** entre conductor y
 * proveedor. El aviso va SIEMPRE al que RECIBE la acción, nunca al que la hace:
 * antes se avisaba al que escribía su propio mensaje («Nuevo mensaje del
 * conductor» en el teléfono del conductor) y el otro no se enteraba de nada.
 *
 * El aviso sale del dispositivo que RECIBE el cambio por tiempo real
 * (`useRealtimeServiceMessages`, `useRealtimeMessages`, `useRealtimeApplications`,
 * `useRealtimeServices`), que es donde la app sabe que el mensaje no es suyo.
 *
 * Módulo con la decisión PURA (`avisoDeMensajeRecibido`, `avisoDePostulacion`) para
 * poder probarla sin red ni notificaciones, más los envoltorios que sí avisan
 * (`avisarDeMensaje`, `avisarDePostulacion`, `avisarDeServicioNuevo`).
 */
import { Vibration } from 'react-native';

import { esAvisoDelHito } from './mensajes';
import { notifyHighPriority } from '../services/notifications';

export interface Aviso {
  titulo: string;
  cuerpo: string;
}

export interface DatosDeMensaje {
  contenido: string;
  /** TEXT | VOICE | PHOTO | LOCATION | CONTACT | SYSTEM (lo que devuelve la base). */
  tipo?: string | null;
  /** ¿Lo escribió este dispositivo? */
  mio: boolean;
  /** Chat de grupo (con varios integrantes) o el del servicio (conductor <-> proveedor). */
  enGrupo: boolean;
  /** Nombre del grupo, para el título del aviso. */
  nombreDelGrupo?: string;
  /** Mi papel en el servicio, para saber quién escribe cuando no es un grupo. */
  miRol?: 'DRIVER' | 'PROVIDER' | null;
}

/** Quita el prefijo «Sistema: » y recorta el cuerpo para que quepa en el aviso. */
export function cuerpoCorto(contenido: string, maximo = 120): string {
  const limpio = (contenido || '').replace(/^Sistema:\s*/, '').trim();
  if (limpio.length <= maximo) return limpio;
  return `${limpio.slice(0, maximo - 1).trimEnd()}…`;
}

/**
 * Qué aviso corresponde a un mensaje que ACABA DE LLEGAR. `null` = no se avisa
 * (los mensajes propios y los vacíos no generan aviso: el aviso es para el otro).
 */
export function avisoDeMensajeRecibido(datos: DatosDeMensaje): Aviso | null {
  if (datos.mio) return null;
  const cuerpo = cuerpoCorto(datos.contenido);
  if (!cuerpo) return null;

  const tipo = (datos.tipo || 'TEXT').toUpperCase();

  // Avisos del sistema: los tres hitos del viaje se anuncian como proceso del
  // servicio; el resto (pagos, ediciones, eliminaciones) como aviso del servicio.
  if (tipo === 'SYSTEM') {
    return {
      titulo: esAvisoDelHito(datos.contenido) ? 'Hito del viaje' : 'Aviso del servicio',
      cuerpo,
    };
  }

  if (tipo === 'VOICE') {
    return {
      titulo: datos.enGrupo ? `Nueva nota de voz en ${nombreDe(datos)}` : 'Nueva nota de voz',
      cuerpo,
    };
  }

  if (tipo === 'PHOTO') {
    return {
      titulo: datos.enGrupo ? `Nueva foto en ${nombreDe(datos)}` : 'Nueva foto en el chat',
      cuerpo,
    };
  }

  if (tipo === 'LOCATION') {
    return {
      titulo: datos.enGrupo ? `Ubicación en ${nombreDe(datos)}` : 'Ubicación compartida en el chat',
      cuerpo,
    };
  }

  if (tipo === 'CONTACT') {
    return {
      titulo: datos.enGrupo ? `Contacto en ${nombreDe(datos)}` : 'Contacto compartido en el chat',
      cuerpo,
    };
  }

  return { titulo: tituloDeMensajeDeTexto(datos), cuerpo };
}

/**
 * Título de un mensaje de texto. Cuando la app no sabe con quién habla (por
 * ejemplo, un aviso del sistema o una pantalla sin rol conocido) dice «Nuevo
 * mensaje», sin inventarse el papel del otro.
 */
export function tituloDeMensajeDeTexto(datos: DatosDeMensaje): string {
  if (datos.enGrupo) return `Nuevo mensaje en ${nombreDe(datos)}`;
  if (datos.miRol === 'DRIVER') return 'Nuevo mensaje del proveedor';
  if (datos.miRol === 'PROVIDER') return 'Nuevo mensaje del conductor';
  return 'Nuevo mensaje';
}

function nombreDe(datos: DatosDeMensaje): string {
  return (datos.nombreDelGrupo || '').trim() || 'el grupo';
}

/**
 * Aviso de una fila que acaba de entrar por tiempo real (mensaje del chat del
 * servicio o del grupo). Es el único sitio donde la app sabe que el mensaje NO es
 * suyo, que es justo lo que decide si hay que avisar.
 */
export function avisarDeMensajeDeLaBase(
  fila: { sender_id?: string | null; content?: string | null; type?: string | null },
  quien: {
    miId?: string | null;
    miRol?: 'DRIVER' | 'PROVIDER' | null;
    enGrupo?: boolean;
    nombreDelGrupo?: string;
  }
): boolean {
  return avisarDeMensaje({
    contenido: fila.content || '',
    tipo: fila.type ?? null,
    mio: Boolean(quien.miId) && (fila.sender_id ?? null) === quien.miId,
    enGrupo: Boolean(quien.enGrupo),
    nombreDelGrupo: quien.nombreDelGrupo,
    miRol: quien.miRol ?? null,
  });
}

/** Aviso para una postulación (nueva para el proveedor; aceptada para el conductor). */
export function avisoDePostulacion(datos: {
  aceptada: boolean;
  tituloDelServicio?: string;
  /** Nombre del postulante (lo usa el proveedor al recibir una postulación). */
  nombreDelPostulante?: string;
}): Aviso {
  const servicio = (datos.tituloDelServicio || 'tu servicio').trim();
  if (datos.aceptada) {
    return {
      titulo: '¡Postulación aceptada!',
      cuerpo: `Fuiste seleccionado para el servicio: ${servicio}. El chat ya está disponible.`,
    };
  }
  const quien = (datos.nombreDelPostulante || '').trim();
  return {
    titulo: 'Nueva postulación',
    cuerpo: quien
      ? `${quien} se postuló a: ${servicio}`
      : `Tienes una postulación para: ${servicio}`,
  };
}

/** Aviso de una tarjeta de servicio que acaban de compartir conmigo. */
export function avisoDeServicioNuevo(tituloDelServicio: string): Aviso {
  return {
    titulo: 'Nuevo servicio compartido',
    cuerpo: (tituloDelServicio || 'Tienes un nuevo servicio disponible').trim(),
  };
}

// ---------------------------------------------------------------------------
// Envoltorios que avisan de verdad (vibración + notificación del sistema)
// ---------------------------------------------------------------------------

export type TipoDeAviso = 'SERVICE_CARD' | 'SERVICE_STEP' | 'CHAT' | 'APPLICATION' | 'GROUP_CHAT';

export function avisar(aviso: Aviso, datos: Record<string, unknown>): boolean {
  if (!aviso || !aviso.titulo) return false;
  Vibration.vibrate?.(200);
  notifyHighPriority(aviso.titulo, aviso.cuerpo, datos);
  return true;
}

export function avisarDeMensaje(datos: DatosDeMensaje & Record<string, unknown>): boolean {
  const aviso = avisoDeMensajeRecibido(datos);
  if (!aviso) return false;
  // Eco de mis propias acciones: los avisos del sistema NO llevan autor, así que el
  // dispositivo que los provoca recibe su propio cambio por tiempo real. Se descarta
  // con la marca que dejó antes de actuar (la deja `addSystemMessage`).
  if (esAvisoPropio(datos.contenido)) return false;
  const esHito = (datos.tipo || '').toUpperCase() === 'SYSTEM';
  // `tipo` es la etiqueta del aviso (CHAT, SERVICE_STEP, GROUP_CHAT…) y la clase del
  // mensaje viaja aparte, en `claseDeMensaje`: si se mezclan, la clase pisa la etiqueta.
  return avisar(aviso, {
    ...datos,
    claseDeMensaje: datos.tipo ?? null,
    tipo: esHito ? 'SERVICE_STEP' : datos.enGrupo ? 'GROUP_CHAT' : 'CHAT',
  });
}

export function avisarDePostulacion(
  datos: Parameters<typeof avisoDePostulacion>[0] & Record<string, unknown>
): boolean {
  return avisar(avisoDePostulacion(datos), { tipo: 'APPLICATION', ...datos });
}

export function avisarDeServicioNuevo(
  tituloDelServicio: string,
  datos: Record<string, unknown> = {}
): boolean {
  return avisar(avisoDeServicioNuevo(tituloDelServicio), { tipo: 'SERVICE_CARD', ...datos });
}

// ---------------------------------------------------------------------------
// El eco de mis propias acciones
// ---------------------------------------------------------------------------

/**
 * Los mensajes del sistema NO llevan autor, así que el dispositivo que provocó el
 * cambio recibe por tiempo real su propio aviso y no hay forma de distinguirlo por
 * el remitente. Antes de provocerlo, la app marca el texto; cuando el aviso vuelve,
 * si la marca es reciente se descarta y solo lo ve el otro.
 */
const ecos = new Map<string, number>();
const VENTANA_DE_ECO_MS = 20000;

export function marcarAvisoPropio(clave: string): void {
  if (!clave) return;
  // Sin purga el mapa crecería sin fin en una sesión larga.
  const ahora = Date.now();
  ecos.forEach((cuando, k) => {
    if (ahora - cuando > VENTANA_DE_ECO_MS) ecos.delete(k);
  });
  ecos.set(clave, ahora);
}

export function esAvisoPropio(clave: string, ahora: number = Date.now()): boolean {
  const cuando = ecos.get(clave);
  if (!cuando) return false;
  if (ahora - cuando > VENTANA_DE_ECO_MS) {
    ecos.delete(clave);
    return false;
  }
  return true;
}

export function olvidarEcos(): void {
  ecos.clear();
}
