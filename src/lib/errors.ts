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
