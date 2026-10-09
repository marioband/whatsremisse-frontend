/**
 * Caché persistente (sobrevive a recargar la aplicación).
 *
 * Es el escalón que va ANTES de cualquier API externa: si ya medimos algo o ya
 * buscamos un lugar, se reutiliza. AsyncStorage ya venía instalado (en web usa
 * localStorage), así que no añade dependencias.
 *
 * Cada entrada guarda cuándo se escribió y se descarta sola al vencer (TTL).
 */

export interface Almacen {
  getItem(clave: string): Promise<string | null>;
  setItem(clave: string, valor: string): Promise<void>;
  removeItem(clave: string): Promise<void>;
  getAllKeys?(): Promise<readonly string[] | string[]>;
  multiRemove?(claves: readonly string[]): Promise<void>;
}

const PREFIJO = 'wr:cache:v1:';
const VERSION = 1;

let almacenInyectado: Almacen | null = null;

/**
 * Registra el almacén del dispositivo (AsyncStorage) o uno falso en las pruebas.
 *
 * Se inyecta desde fuera a propósito: así este módulo no importa AsyncStorage y
 * puede probarse con node sin arrastrar dependencias de React Native.
 */
export function configurarAlmacen(almacen: Almacen | null): void {
  almacenInyectado = almacen;
}

async function obtenerAlmacen(): Promise<Almacen | null> {
  return almacenInyectado;
}

interface Entrada<T> {
  v: number;
  escrito: number;
  valor: T;
}

function claveConPrefijo(clave: string): string {
  return `${PREFIJO}${clave}`;
}

/** Cuánto vale lo guardado en el teléfono (mismo plazo para el inicio y para el chat). */
export const TTL_DE_LA_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * La clave de la conversación (08-10-2026): LLEVA EL ID DEL USUARIO y el del servicio, como el
 * resto de la caché — los mensajes de una cuenta no se pintan en la de otra, y las conversaciones
 * de un servicio no se mezclan con las de otro.
 */
export function claveDeMensajesDe(userId: string, serviceId: string): string {
  return `mensajes:${userId}:${serviceId}`;
}

/**
 * Lo que se guarda de una conversación: solo los ÚLTIMOS mensajes (por defecto 200). Un chat puede
 * tener miles y el almacén del teléfono es pequeño; para pintar al volver sobran los últimos.
 */
export function mensajesParaGuardar<T>(mensajes: T[], limite = 200): T[] {
  if (!Array.isArray(mensajes)) return [];
  if (mensajes.length <= limite) return mensajes;
  return mensajes.slice(mensajes.length - limite);
}

/** Lee una entrada si existe y no venció. Devuelve null en cualquier otro caso. */
export async function leerCache<T>(clave: string, ttlMs: number): Promise<T | null> {
  const almacen = await obtenerAlmacen();
  if (!almacen) return null;
  try {
    const crudo = await almacen.getItem(claveConPrefijo(clave));
    if (!crudo) return null;
    const entrada = JSON.parse(crudo) as Entrada<T>;
    if (entrada.v !== VERSION) return null;
    if (ttlMs >= 0 && Date.now() - entrada.escrito >= ttlMs) return null;
    return entrada.valor;
  } catch {
    return null;
  }
}

/** Guarda una entrada. Si el almacén falla, no interrumpe la pantalla. */
export async function guardarCache(
  clave: string,
  valor: unknown,
  escrito = Date.now()
): Promise<void> {
  const almacen = await obtenerAlmacen();
  if (!almacen) return;
  try {
    const entrada: Entrada<unknown> = { v: VERSION, escrito, valor };
    await almacen.setItem(claveConPrefijo(clave), JSON.stringify(entrada));
  } catch {
    // Un problema de almacenamiento nunca debe romper la experiencia.
  }
}

/** Cuándo se escribió una entrada (para decidir si hay que recalcular). */
export async function cuandoSeGuardo(clave: string): Promise<number | null> {
  const almacen = await obtenerAlmacen();
  if (!almacen) return null;
  try {
    const crudo = await almacen.getItem(claveConPrefijo(clave));
    if (!crudo) return null;
    const entrada = JSON.parse(crudo) as Entrada<unknown>;
    return entrada.escrito ?? null;
  } catch {
    return null;
  }
}

export async function borrarDeCache(clave: string): Promise<void> {
  const almacen = await obtenerAlmacen();
  if (!almacen) return;
  try {
    await almacen.removeItem(claveConPrefijo(clave));
  } catch {
    // Idem: silencioso a propósito.
  }
}

/** Borra todas las entradas de la caché de la app (ajustes / diagnóstico). */
export async function limpiarCacheCompleta(): Promise<void> {
  await limpiarCacheConPrefijo('');
}

/** Borra solo las entradas cuya clave empieza por el prefijo dado. */
export async function limpiarCacheConPrefijo(prefijo: string): Promise<number> {
  const almacen = await obtenerAlmacen();
  if (!almacen?.getAllKeys || !almacen.multiRemove) return 0;
  try {
    const claves = (await almacen.getAllKeys()).filter((clave) =>
      clave.startsWith(`${PREFIJO}${prefijo}`)
    );
    if (claves.length === 0) return 0;
    await almacen.multiRemove(claves);
    return claves.length;
  } catch {
    return 0;
  }
}
