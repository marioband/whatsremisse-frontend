/**
 * Convierte el error de Supabase / PostgREST / red en un texto legible para
 * mostrarlo en pantalla. Nunca deja el fallo en silencio: si el error trae
 * status, código, detalles o hint, se incluyen para poder diagnosticar.
 */
export function describeError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as {
      message?: string;
      status?: number;
      code?: string;
      details?: string;
      hint?: string;
    };

    const head = e.message || 'Error inesperado.';
    const extra = [
      e.status ? `HTTP ${e.status}` : undefined,
      e.code ? `Código: ${e.code}` : undefined,
      e.details,
      e.hint,
    ].filter((part): part is string => Boolean(part));

    return extra.length > 0 ? `${head}\n${extra.join('\n')}` : head;
  }

  return String(err);
}

/**
 * ¿El error dice que la COLUMNA no existe? (PostgREST: `42703`, o `PGRST204` «schema
 * cache», que es como responde cuando la tabla todavía no tiene esa columna).
 *
 * Lo usa el guardado de servicios: las columnas de pago, fecha de pago, observaciones y
 * unidad las añade la migración **0024**, y si aún no está aplicada hay que reintentar sin
 * ellas (el servicio se publica igual, mostrando los respaldos en la tarjeta) en vez de
 * dejar al usuario sin publicar con «column payment_method does not exist».
 */
export function esColumnaAusente(err: unknown): boolean {
  const e = err as { code?: string; message?: string; details?: string; hint?: string } | null;
  if (!e) return false;
  const codigo = e.code || '';
  const texto = `${e.message || ''} ${e.details || ''} ${e.hint || ''}`.toLowerCase();
  return (
    codigo === '42703' ||
    codigo === 'PGRST204' ||
    texto.includes('does not exist') ||
    texto.includes('schema cache')
  );
}

/**
 * ¿El fallo fue de TRANSPORTE —la petición se quedó sin respuesta— y no del servidor?
 *
 * supabase-js marca estos fallos con `status: 0`, sin `code`, con el nombre del error
 * del navegador dentro del mensaje (`TypeError: Failed to fetch`, `Network request
 * failed`…) y la PILA DE LLAMADAS metida en `details` — de ahí que el aviso saliera con
 * el texto técnico y el `at http://…` (18-09-2026, al finalizar el viaje).
 *
 * Distinguirlo importa: cuando falla el transporte, la escritura PUEDE haber llegado
 * igualmente a la base (medido: el aviso "No se pudo enviar" salió con el
 * "Sistema: Viaje finalizado." ya guardado y sin duplicados), así que antes de dar un
 * mensaje por perdido hay que comprobarlo y, si no está, entonces sí se reintenta.
 */
export function esFalloDeTransporte(err: unknown): boolean {
  const e = err as { status?: number; code?: string; name?: string; message?: string } | null;
  if (!e || typeof e !== 'object') return false;
  // Petición cancelada o abortada: tampoco hay respuesta, así que vale lo mismo.
  if (e.name === 'AbortError' || e.code === 'ABORT_ERR') return true;
  if (e.code) return false; // error de PostgREST: la base respondió
  if (e.status) return false; // respuesta HTTP: el servidor contestó
  const texto = `${e.name || ''} ${e.message || ''}`.toLowerCase();
  return (
    texto.includes('failed to fetch') ||
    texto.includes('fetch failed') ||
    texto.includes('network request failed') ||
    texto.includes('networkerror') ||
    texto.includes('network error') ||
    texto.includes('load failed')
  );
}

/**
 * Texto del aviso para el usuario. Los fallos de transporte se explican en cristiano
 * (la pila de llamadas no le dice nada a nadie); el resto conserva el detalle de
 * `describeError`, que sí sirve para diagnosticar. El detalle completo va a la consola.
 */
export function textoDeErrorParaElUsuario(err: unknown): string {
  if (esFalloDeTransporte(err)) {
    return 'No hubo respuesta del servidor. Comprueba tu conexión y vuelve a intentarlo.';
  }
  if (esFalloDeEnvioDeSms(err)) {
    return 'No pudimos enviar el código al celular. Espera un minuto y vuelve a intentarlo.';
  }
  return describeError(err);
}

/**
 * ¿El error dice que el SMS no se pudo enviar? (24-09-2026)
 *
 * El servidor responde con el texto CRUDO del proveedor: «Error sending confirmation OTP to
 * provider: primary compliance profile is not approved… HTTP 422 / Código: sms_send_failed».
 * El usuario lo vio tal cual en el teléfono, en inglés y hablando de Twilio. Es un fallo
 * nuestro/de la cuenta, no suyo, así que se le dice en español y en una línea; el detalle
 * técnico sigue yendo a la consola para poder diagnosticarlo.
 */
export function esFalloDeEnvioDeSms(err: unknown): boolean {
  const texto = describeError(err).toLowerCase();
  return (
    texto.includes('sms_send_failed') ||
    texto.includes('error sending confirmation otp') ||
    texto.includes('error sending sms') ||
    texto.includes('error sending otp') ||
    texto.includes('sms provider')
  );
}
