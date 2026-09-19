/**
 * Los avisos en el navegador (Web Push) para la app instalada en el teléfono.
 *
 * Por qué Web Push y no `expo-notifications`: la app que usa el usuario en el iPhone es una PWA
 * (instalada desde Safari). `expo-notifications` solo funciona en apps nativas de las tiendas, así
 * que ahí no llega ningún aviso. El camino del navegador sí existe en iOS desde 2023 y exige:
 * permiso del usuario, un service worker que atienda el evento `push` (`/sw-avisos.js`, sin caché)
 * y que el servidor firme el aviso con la clave VAPID.
 *
 * Este archivo NO decide cuándo avisar: solo pide permiso, guarda la suscripción del navegador en
 * la base (RPC `guardar_suscripcion_de_avisos`) y dice en qué estado está.
 */
import { Platform } from 'react-native';

import { guardarSuscripcionDeAvisos, borrarSuscripcionDeAvisos } from './database';

/**
 * La clave PÚBLICA VAPID del proyecto. Es pública por diseño (la privada vive en el servidor).
 * Se puede sustituir por otra sin tocar nada más: la app y el servidor solo tienen que usar la
 * misma pareja.
 */
export const CLAVE_PUBLICA_VAPID = 'PENDIENTE_DE_CLAVE';

/** El archivo del service worker (solo avisos, sin caché). */
export const RUTA_DEL_SERVICE_WORKER = '/sw-avisos.js';

export type EstadoDeAvisos = 'no-soportado' | 'falta-permiso' | 'denegado' | 'activo';

function enNavegador(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined' && typeof navigator !== 'undefined';
}

/** ¿Este navegador puede recibir avisos? (en el iPhone, solo con la app instalada) */
export function soporteDeAvisos(): boolean {
  return (
    enNavegador() &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    typeof Notification.requestPermission === 'function'
  );
}

/** ¿Está la app abierta como instalada (sin la barra de Safari)? En iOS es obligatorio para los avisos. */
export function estaInstalada(): boolean {
  if (!enNavegador()) return false;
  const deSafari = (navigator as unknown as { standalone?: boolean }).standalone === true;
  const deChrome =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  return deSafari || deChrome;
}

/** En qué estado están los avisos en ESTE teléfono. */
export async function estadoDeAvisos(): Promise<EstadoDeAvisos> {
  if (!soporteDeAvisos()) return 'no-soportado';
  if (Notification.permission === 'denied') return 'denegado';
  if (Notification.permission !== 'granted') return 'falta-permiso';
  const registro = await navigator.serviceWorker.getRegistration(RUTA_DEL_SERVICE_WORKER);
  const suscripcion = registro ? await registro.pushManager.getSubscription() : null;
  return suscripcion ? 'activo' : 'falta-permiso';
}

function urlBase64AArrayBuffer(base64: string): ArrayBuffer {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
  const normal = (base64 + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const crudo = window.atob(normal);
  const bytes = new Uint8Array(crudo.length);
  for (let i = 0; i < crudo.length; i += 1) bytes[i] = crudo.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Pide permiso y deja el teléfono suscrito. Tiene que llamarse desde un TOQUE del usuario: iOS
 * ignora la petición de permiso si no viene de un gesto.
 *
 * Devuelve el estado en el que queda todo, para que la pantalla lo diga sin adivinar.
 */
export async function activarAvisos(): Promise<{
  ok: boolean;
  estado: EstadoDeAvisos;
  motivo?: string;
}> {
  if (!soporteDeAvisos()) {
    return { ok: false, estado: 'no-soportado', motivo: 'Este navegador no puede recibir avisos.' };
  }
  if (!CLAVE_PUBLICA_VAPID || CLAVE_PUBLICA_VAPID === 'PENDIENTE_DE_CLAVE') {
    return { ok: false, estado: 'falta-permiso', motivo: 'Falta la clave pública de los avisos.' };
  }

  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') {
    return {
      ok: false,
      estado: permiso === 'denied' ? 'denegado' : 'falta-permiso',
      motivo:
        permiso === 'denied'
          ? 'Bloqueaste los avisos. Se activan desde los ajustes del navegador.'
          : 'No diste permiso para los avisos.',
    };
  }

  const registro = await navigator.serviceWorker.register(RUTA_DEL_SERVICE_WORKER);
  await navigator.serviceWorker.ready;

  let suscripcion = await registro.pushManager.getSubscription();
  if (!suscripcion) {
    suscripcion = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64AArrayBuffer(CLAVE_PUBLICA_VAPID),
    });
  }

  const json = suscripcion.toJSON();
  const llaves = (json.keys || {}) as { p256dh?: string; auth?: string };
  if (!json.endpoint || !llaves.p256dh || !llaves.auth) {
    return {
      ok: false,
      estado: 'falta-permiso',
      motivo: 'El navegador no devolvió las claves del aviso.',
    };
  }

  const guardado = await guardarSuscripcionDeAvisos({
    endpoint: json.endpoint,
    p256dh: llaves.p256dh,
    auth: llaves.auth,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  });

  if (!guardado) {
    return { ok: false, estado: 'falta-permiso', motivo: 'No se pudo guardar la suscripción.' };
  }
  return { ok: true, estado: 'activo' };
}

/** Deja de recibir avisos en este teléfono. */
export async function desactivarAvisos(): Promise<boolean> {
  if (!soporteDeAvisos()) return false;
  const registro = await navigator.serviceWorker.getRegistration(RUTA_DEL_SERVICE_WORKER);
  const suscripcion = registro ? await registro.pushManager.getSubscription() : null;
  if (!suscripcion) return true;
  const endpoint = suscripcion.endpoint;
  await suscripcion.unsubscribe();
  await borrarSuscripcionDeAvisos(endpoint);
  return true;
}
