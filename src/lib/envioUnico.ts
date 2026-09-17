/**
 * "Una sola vez": el candado de las acciones que escriben en la base.
 *
 * Por qué existe (reporte del usuario, 17-09-2026): al elegir los grupos y pulsar
 * Enviar varias veces antes de que termine la carga, se publicaban VARIAS alertas del
 * mismo servicio. La guarda de React no sirve para esto: `setEnviando(true)` es
 * asíncrono, así que dos toques en el mismo hueco leen `false` los dos y disparan dos
 * escrituras. La guarda tiene que ser SÍNCRONA (esto, un `Map`/`ref` en memoria) y,
 * en el store, devolver la MISMA promesa a quien insista: el segundo toque no crea
 * otra tarjeta y recibe el id de la que ya se está publicando.
 *
 * Módulo puro (cero imports): se prueba con node, sin React ni base de datos.
 */

export interface Candado {
  /** ¿Ya hay una acción en vuelo con esa clave? */
  enVuelo(clave: string): boolean;
  /**
   * Ejecuta `accion` una sola vez por clave mientras esté en vuelo; quien insista
   * recibe la MISMA promesa. La clave se libera al terminar (éxito o fallo), así que
   * reintentar después de un error sí vuelve a ejecutar la acción.
   */
  unaSolaVez<T>(clave: string, accion: () => Promise<T>): Promise<T>;
  /** Claves en vuelo, en orden de entrada (pruebas y diagnóstico). */
  claves(): string[];
}

export function crearCandado(): Candado {
  const enVuelo = new Map<string, Promise<unknown>>();

  return {
    enVuelo: (clave) => enVuelo.has(clave),
    claves: () => Array.from(enVuelo.keys()),
    unaSolaVez<T>(clave: string, accion: () => Promise<T>): Promise<T> {
      const yaEnVuelo = enVuelo.get(clave);
      if (yaEnVuelo) return yaEnVuelo as Promise<T>;

      // Solo se libera si sigue siendo esta misma acción: si ya entró otra con la misma
      // clave (no debería, pero si alguien la liberó a mano), no se pisa.
      const liberar = () => {
        if (enVuelo.get(clave) === promesa) enVuelo.delete(clave);
      };

      // `then` con las dos ramas en vez de `finally`: `finally` devuelve una promesa
      // nueva y habría que guardar la que ven los llamadores para que el dedupe funcione.
      const promesa: Promise<T> = Promise.resolve()
        .then(() => accion())
        .then(
          (resultado) => {
            liberar();
            return resultado;
          },
          (err) => {
            liberar();
            throw err;
          }
        );
      enVuelo.set(clave, promesa);
      return promesa;
    },
  };
}

/**
 * Clave del envío: la tarjeta que ya existe (`tarjeta:<id>`) o el borrador que se está
 * publicando (`borrador:<id>`). El id del borrador lo genera `CreateServiceScreen` una
 * vez por formulario, así que todos los toques del mismo Enviar comparten clave.
 */
export function claveDeEnvio(tarjetaId?: string | null, borrador?: { id?: string } | null): string {
  return tarjetaId ? `tarjeta:${tarjetaId}` : `borrador:${borrador?.id ?? 'sin-id'}`;
}

/**
 * Estado del botón "Enviar". Mientras la publicación está en vuelo el botón se ve
 * DESHABILITADO y dice qué está pasando: el usuario no puede volver a pulsarlo y, si
 * lo intenta, no pasa nada (esa es la mitad visible del arreglo; la efectiva es la
 * guarda de arriba).
 */
export type EstadoDeEnvio = 'listo' | 'enviando' | 'publicado';

export const TEXTO_ENVIAR = 'Enviar';
export const TEXTO_ENVIANDO = 'Enviando…';
export const TEXTO_PUBLICADO = 'Publicado';

export interface BotonDeEnvio {
  deshabilitado: boolean;
  texto: string;
}

export function estadoDelBotonDeEnvio(estado: EstadoDeEnvio): BotonDeEnvio {
  if (estado === 'enviando') return { deshabilitado: true, texto: TEXTO_ENVIANDO };
  if (estado === 'publicado') return { deshabilitado: true, texto: TEXTO_PUBLICADO };
  return { deshabilitado: false, texto: TEXTO_ENVIAR };
}

/** Opacidad del botón: apagado mientras está en vuelo o ya publicado. */
export function opacidadDelBotonDeEnvio(estado: EstadoDeEnvio): number {
  return estado === 'listo' ? 1 : 0.6;
}
