/**
 * Actualizaciones de la app web en etapa de pruebas de campo (pedido del usuario, 24-09-2026):
 * «los usuarios deberían saber que hay actualización pendiente y no deberían poder usar la app sin
 * actualizar».
 *
 * CÓMO FUNCIONA EN UNA WEBAPP (y por qué así):
 *   - El build deja un sello en DOS sitios: `/version.json` en el servidor (lo que se consulta) y
 *     dos metas en el propio `index.html` (la versión que está CORRIENDO en ese teléfono). Comparar
 *     los dos es todo el mecanismo.
 *   - La consulta va con `cache: 'no-store'`: si la caché contestara por el servidor, el aviso no
 *     llegaría nunca.
 *   - Sin datos NO se bloquea a nadie: si `version.json` no existe (un despliegue viejo, o este
 *     paso del build se saltó) la app sigue funcionando. Un fallo aquí no puede dejar la app
 *     inservible.
 */

export const RUTA_DE_LA_VERSION = '/version.json';

export interface VersionDelSitio {
  version: string;
  fecha?: string;
  /** El despliegue se marcó como urgente: bloquea al instante, aunque esté en medio de un servicio. */
  urgente?: boolean;
}

export interface VersionEnEjecucion {
  version: string;
  fecha?: string;
}

/** La versión que está corriendo: el sello que el build dejó en el propio HTML. */
export function versionEnEjecucion(): VersionEnEjecucion | null {
  if (typeof document === 'undefined') return null;
  const meta = document.querySelector('meta[name="wr-version"]')?.getAttribute('content')?.trim();
  if (!meta) return null;
  const fecha = document
    .querySelector('meta[name="wr-version-fecha"]')
    ?.getAttribute('content')
    ?.trim();
  return { version: meta, fecha: fecha || undefined };
}

/** ¿La versión del servidor es distinta de la mía? (regla pura: se prueba sin navegador) */
export function hayVersionNueva(
  mia: VersionEnEjecucion | null | undefined,
  suya: VersionDelSitio | null | undefined
): boolean {
  if (!mia || !mia.version || !suya || !suya.version) return false;
  return suya.version !== mia.version;
}

/** Pide la versión desplegada, sin caché y sin poder tumbar la app si algo falla. */
export async function leerVersionDelSitio(timeoutMs = 6000): Promise<VersionDelSitio | null> {
  if (typeof fetch !== 'function') return null;
  const controlador = typeof AbortController === 'function' ? new AbortController() : null;
  const temporizador = controlador ? setTimeout(() => controlador.abort(), timeoutMs) : null;
  try {
    const respuesta = await fetch(RUTA_DE_LA_VERSION, {
      cache: 'no-store',
      signal: controlador ? controlador.signal : undefined,
    });
    if (!respuesta.ok) return null;
    const datos = (await respuesta.json()) as Partial<VersionDelSitio>;
    if (!datos || typeof datos.version !== 'string' || datos.version.trim() === '') return null;
    return {
      version: datos.version.trim(),
      fecha: typeof datos.fecha === 'string' ? datos.fecha : undefined,
      urgente: datos.urgente === true,
    };
  } catch {
    // Sin red, o el archivo no está: no hay nada que avisar (y nunca se bloquea por esto).
    return null;
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}

/** El texto de una versión tal como se enseña: «1a2b3c4d · 24/09 19:06». */
export function lineaDeVersion(version: VersionEnEjecucion | VersionDelSitio | null): string {
  if (!version) return '';
  const fecha = version.fecha ? formatearFechaDeVersion(version.fecha) : '';
  return [version.version, fecha].filter(Boolean).join(' · ');
}

function formatearFechaDeVersion(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  const dosDigitos = (numero: number) => String(numero).padStart(2, '0');
  return [
    `${dosDigitos(fecha.getDate())}/${dosDigitos(fecha.getMonth() + 1)}`,
    `${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}`,
  ].join(' ');
}

/** Recarga la app pidiendo el HTML nuevo (el `?v=` evita que la caché devuelva el de antes). */
export function recargarConLaVersionNueva(version: string): void {
  if (typeof window === 'undefined' || !window.location) return;
  try {
    const destino = new URL(window.location.href);
    destino.searchParams.set('v', version);
    window.location.replace(destino.toString());
  } catch {
    window.location.reload();
  }
}
