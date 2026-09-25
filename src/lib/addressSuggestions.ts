/**
 * Qué filas muestra el desplegable del campo de dirección.
 *
 * Requisito del proyecto: mientras el usuario escribe, debajo del campo aparece
 * PRIMERO su propio texto como opción elegible ("usar lo que escribí") y debajo
 * las sugerencias de la app. El texto del usuario nunca se pierde ni se
 * reemplaza solo: elegir su propia escritura es siempre posible, tenga o no
 * premium.
 *
 * Las sugerencias son una función Premium; sin premium se muestra, en su lugar,
 * el aviso de que están bloqueadas (y no se llama a ninguna API).
 */

import { LugarGuardado } from './lugaresFrecuentes';
import { SugerenciaDireccion } from './places';

export type FilaSugerencia =
  | { tipo: 'mi-texto'; texto: string; titulo: string; subtitulo: string }
  | { tipo: 'sugerencia'; sugerencia: SugerenciaDireccion }
  | { tipo: 'cargando' }
  | { tipo: 'premium-bloqueado'; titulo: string; subtitulo: string }
  /** Lugar guardado (verificado o de los que repite el usuario): local, coste $0. */
  | { tipo: 'lugar-guardado'; lugar: LugarGuardado };

export const MINIMO_CARACTERES = 3;

/**
 * Desde cuántas letras se le pregunta a Google.
 *
 * Por qué 6 y no 3 (25-09-2026): cada tanda de escritura es una sesión de cobro. Si la
 * sesión cierra con una elección, Google perdona TODAS las letras; si se queda sin cerrar
 * (búsqueda abandonada), factura cada letra a $2,83/1.000. Las primeras letras son las más
 * ambiguas: generan consultas que nadie elige. Con 6 letras la persona escribe una intención
 * real y las consultas por dirección bajan (modelado: las abandonadas del 30 % al 10 % valen
 * S/ 2.199 al mes con los volúmenes del usuario).
 *
 * El mínimo de la lista LOCAL sigue siendo 3: ofrecer los lugares guardados no cuesta nada.
 */
export const MINIMO_CARACTERES_PARA_GOOGLE = 6;

export interface OpcionesDeFilas {
  abierto: boolean;
  premium: boolean;
  texto: string;
  sugerencias: SugerenciaDireccion[];
  cargando: boolean;
  /** Lugares guardados que corresponden a lo escrito (ver `lugaresFrecuentes.ts`). */
  lugares?: readonly LugarGuardado[];
}

export function filasDeSugerencias({
  abierto,
  premium,
  texto,
  sugerencias,
  cargando,
  lugares = [],
}: OpcionesDeFilas): FilaSugerencia[] {
  const escrito = texto.trim();
  if (!abierto) return [];

  // Primero los lugares guardados: con el campo recién abierto es el aeropuerto (y lo
  // que el usuario repite), que es lo que más se pide. No cuestan ninguna llamada.
  const filas: FilaSugerencia[] = lugares.map((lugar) => ({ tipo: 'lugar-guardado', lugar }));

  // Sin texto suficiente no hay nada más que ofrecer (ni se llama a Google).
  if (escrito.length < MINIMO_CARACTERES) return filas;

  filas.push({
    tipo: 'mi-texto',
    texto: escrito,
    titulo: `Usar "${escrito}"`,
    subtitulo: 'Mi dirección, tal como la escribí',
  });

  if (!premium) {
    filas.push({
      tipo: 'premium-bloqueado',
      titulo: 'Sugerencias de dirección (Premium)',
      subtitulo: 'Escribe tu dirección o activa Premium para que la app te sugiera',
    });
    return filas;
  }

  if (cargando && sugerencias.length === 0) {
    filas.push({ tipo: 'cargando' });
    return filas;
  }

  // No se repite como sugerencia la misma dirección que el usuario ya escribió.
  sugerencias
    .filter((s) => s.texto.trim().toLowerCase() !== escrito.toLowerCase())
    .forEach((sugerencia) => filas.push({ tipo: 'sugerencia', sugerencia }));

  return filas;
}

/** ¿Merece llamar a la API? (evita pedir lo mismo que ya se muestra) */
export function convieneBuscar(
  premium: boolean,
  texto: string,
  ultimaConsulta: string | null,
  sugerencias: SugerenciaDireccion[]
): boolean {
  const escrito = texto.trim();
  if (!premium || escrito.length < MINIMO_CARACTERES_PARA_GOOGLE) return false;
  if (escrito === ultimaConsulta) return false;
  const yaMostrada = sugerencias.some(
    (s) => s.texto.trim().toLowerCase() === escrito.toLowerCase()
  );
  return !yaMostrada;
}

/**
 * ¿Lo escrito ya es un lugar guardado CON punto exacto? Entonces no hay que preguntarle a
 * Google: elegirlo deja el servicio con coordenadas y no cuesta ninguna llamada (decisión del
 * usuario, 25-09-2026: «que se usen más de 5 veces ya debería guardarse para no volver a hacer
 * la consulta»). Sin punto (`exacto` en false) sí hay que resolverlo, y ahí manda Google.
 */
export function hayLugarGuardadoQueResuelve(lugares: readonly LugarGuardado[]): boolean {
  return lugares.some(
    (lugar) =>
      lugar.exacto &&
      typeof lugar.lat === 'number' &&
      typeof lugar.lng === 'number' &&
      !(lugar.lat === 0 && lugar.lng === 0)
  );
}
