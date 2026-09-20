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
 * El refresco de token que hace Supabase al volver NO debe volver a poner la pantalla de carga.
 * Estuvo puesto y era, literalmente, la «carga al volver» que reportó el usuario: la app estaba
 * pintada, llegaba `TOKEN_REFRESHED` y el logo tapaba todo otra vez.
 */
export function debeTaparConElLogo(evento: string): boolean {
  return evento === 'SIGNED_IN' || evento === 'SIGNED_OUT';
}
