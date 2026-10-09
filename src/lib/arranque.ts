/**
 * El arranque de la app sin esperar a la red (pedido del usuario, 20-09-2026).
 *
 * QUÉ PROBLEMA RESUELVE: al volver a la app —o al reabrirla, que es lo que hace iOS con una PWA
 * después de un rato fuera— el arranque se quedaba en el logo de carga. La culpa no era del
 * perfil (ya se pintaba con lo guardado desde el 19-09), sino de la SESIÓN: cuando el token ya
 * venció, `supabase.auth.getSession()` tiene que ir a la red a refrescarlo, y hasta que eso
 * vuelve no había nada que enseñar.
 *
 * La decisión vive aquí, separada de React, porque es una regla con trampa: solo se puede pintar
 * con lo guardado si el PERFIL guardado es del MISMO usuario que la sesión guardada. Si no, se
 * estaría enseñando la app de una cuenta en el teléfono de otra (o de alguien que cerró sesión).
 */

/**
 * El id con el que se puede pintar la app AHORA MISMO, o `null` si hay que esperar a la red.
 *
 * `perfilGuardado` y `usuarioGuardado` son lo que dejó el arranque anterior en el teléfono
 * (JSON del perfil y el id del usuario). Devuelve `null` —o sea, se espera a la red— cuando:
 *   - no hay usuario guardado (primer arranque, o alguien cerró sesión);
 *   - no hay perfil guardado, o su JSON quedó ilegible;
 *   - el perfil guardado NO tiene id, o es de otra cuenta.
 */
export function usuarioParaPintarSinRed(
  perfilGuardado: string | null | undefined,
  usuarioGuardado: string | null | undefined
): string | null {
  const idDeLaSesion = (usuarioGuardado ?? '').trim();
  if (!idDeLaSesion) return null;
  if (!perfilGuardado) return null;

  try {
    const perfil = JSON.parse(perfilGuardado) as { id?: unknown } | null;
    const idDelPerfil = typeof perfil?.id === 'string' ? perfil.id.trim() : '';
    if (!idDelPerfil || idDelPerfil !== idDeLaSesion) return null;
    return idDeLaSesion;
  } catch {
    // Caché ilegible: se espera a la red, que es lo seguro.
    return null;
  }
}

/**
 * ¿Este evento de la sesión debe volver a poner la pantalla de carga (el logo)?
 *
 * OJO — LO QUE SE DESCUBRIÓ EL 08-10-2026: **`SIGNED_IN` NO significa «entrar de verdad»**.
 * `supabase.auth.onAuthStateChange` lo dispara TAMBIÉN cada vez que la página se recarga y la
 * sesión se recupera del almacén del teléfono: en `@supabase/auth-js` (`GoTrueClient`,
 * `_recoverAndRefresh`) está escrito tal cual — al leer la sesión guardada llama a
 * `_notifyAllSubscribers('SIGNED_IN', currentSession)`. Como esta regla tapaba la app en
 * `SIGNED_IN` y solo la destapaba cuando la red devolvía el perfil, volver a la app (botón «Ir a
 * origen/destino» → mapa → atrás, que recarga la página) dejaba **el logo a pantalla completa
 * —fondo negro de marca— por largo tiempo**, que es lo que el usuario reportó. `TOKEN_REFRESHED`
 * ya se había quitado el 20-09; faltaba este.
 *
 * La regla ahora mira las dos cosas: el evento Y si la app YA ESTÁ PINTADA con lo guardado.
 *   - `SIGNED_OUT` → siempre se tapa (el teléfono tiene que volver al registro).
 *   - `SIGNED_IN` → se tapa SOLO si no había nada pintado (un alta de verdad, en un teléfono
 *     donde todavía no hay perfil): ahí el logo cubre mientras se resuelve quién es.
 *   - Cualquier otro (`TOKEN_REFRESHED`, `INITIAL_SESSION`, `USER_UPDATED`…) → nunca.
 */
export function debeTaparConElLogo(evento: string, yaPintado: boolean): boolean {
  if (evento === 'SIGNED_OUT') return true;
  if (evento !== 'SIGNED_IN') return false;
  return !yaPintado;
}
