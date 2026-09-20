/**
 * «Estoy viendo esta conversación» (pedido del usuario, 20-09-2026).
 *
 * REGLA DEL USUARIO: «si uno está en un chat conversando, ya no le debería llegar
 * notificaciones; pero si el usuario estando en el chat minimiza el app, ahí sí debería
 * llegarle la notificación».
 *
 * Cómo se consigue, y por qué así:
 *   - Mientras la pantalla del chat está abierta Y la app a la vista, se MARCA en el servidor
 *     qué conversación se está mirando (`marcar_conversacion_vista`, migración 0036).
 *   - En cuanto la app pasa a segundo plano (minimizar, cambiar de app, bloquear el teléfono)
 *     la marca se BORRA en el acto: el aviso vuelve a llegar sin esperar a que venza.
 *   - `public.avisar()` (el único sitio por donde salen los avisos) descarta a quien tenga esa
 *     misma dirección marcada. Por eso el filtro vale para TODOS los avisos sin tocar ninguno.
 *
 * La decisión vive aquí, separada de React, para poder probarla con node: `urlDeLaConversacion`
 * (la dirección tiene que ser EXACTAMENTE la que llevan los avisos) y `decisionDeLaMarca`.
 *
 * Las direcciones son las de la 0034: la app ya las entiende (`RootNavigator` → ENLACES).
 */

/** Cuántas veces late la marca mientras el chat sigue a la vista. */
export const LATIDO_MS = 30_000;

/** La conversación de un servicio (conductor ↔ proveedor) o de un grupo. */
export function urlDeLaConversacion(
  clase: 'servicio' | 'grupo',
  id: string | null | undefined
): string {
  const limpio = (id ?? '').trim();
  if (!limpio) return '';
  return clase === 'grupo' ? `/grupo/${limpio}` : `/chat/${limpio}`;
}

/** Qué hay que hacer con la marca: ponerla, borrarla, o no tocar nada. */
export type DecisionDeLaMarca = 'marcar' | 'cerrar' | 'nada';

/**
 * La app oculta (minimizada, en segundo plano o con el teléfono bloqueado) → se borra la marca:
 * a partir de ahí el aviso tiene que llegar. A la vista → se marca.
 */
export function decisionDeLaMarca(url: string, oculta: boolean): DecisionDeLaMarca {
  if (oculta) return 'cerrar';
  return (url ?? '').trim() ? 'marcar' : 'nada';
}

/**
 * ¿Sigue la marca vieja sirviendo? El servidor la da por buena 2 minutos; aquí se usa el mismo
 * criterio para la decisión LOCAL (no enseñar la notificación del sistema estando dentro).
 */
export const VALIDEZ_DE_LA_MARCA_MS = 120_000;

export function marcaSigueViva(vistoEn: number, ahora: number = Date.now()): boolean {
  if (!vistoEn) return false;
  const edad = ahora - vistoEn;
  return edad >= 0 && edad < VALIDEZ_DE_LA_MARCA_MS;
}

// ---------------------------------------------------------------------------
// La marca de este dispositivo (para decidir sin ir al servidor)
// ---------------------------------------------------------------------------

let marcada: { url: string; vistoEn: number } | null = null;

/** Se llama al abrir el chat y en cada latido. */
export function recordarQueEstoyViendo(url: string, ahora: number = Date.now()): void {
  if (!(url ?? '').trim()) return;
  marcada = { url, vistoEn: ahora };
}

/** Se llama al salir del chat, al minimizar y al cerrar sesión. */
export function olvidarLaConversacion(): void {
  marcada = null;
}

/**
 * ¿Estoy mirando ahora mismo esta conversación? Es lo que evita que el propio teléfono enseñe
 * la notificación de algo que ya estoy leyendo en pantalla.
 */
export function estoyViendoAhora(url: string, ahora: number = Date.now()): boolean {
  if (!marcada) return false;
  if (marcada.url !== (url ?? '').trim()) return false;
  return marcaSigueViva(marcada.vistoEn, ahora);
}
