/**
 * Las UNIDADES: qué vehículos pueden tomar cada servicio y qué vehículos tiene cada
 * conductor (regla del usuario, 19-09-2026).
 *
 * Antes era UN tipo por servicio (`'Todos'` o uno de los cuatro) y OTRO por conductor, y se
 * comparaban por igualdad. El usuario cambió la regla: el proveedor marca **varias**
 * unidades a la vez (las que sirven para su servicio) y el conductor declara **varias**
 * unidades a la vez (las que tiene). La pregunta dejó de ser «¿es igual?» y pasó a ser
 * «¿tienen alguna en común?».
 *
 * Lo que fija el pedido:
 *   - Se va el botón «Todos»: el proveedor marca las que sirven. `'Todos'` y el requisito
 *     vacío se siguen leyendo como «cualquiera», que es lo que significan las alertas ya
 *     publicadas con la forma vieja (no se rompen).
 *   - Por defecto van marcadas `Auto`, `Camioneta` y `Camioneta 3 filas`; `Auto compacto`
 *     queda libre.
 *   - Debajo va el desplegable de **unidades grandes**: `Minivan`, `Minibús` y `Bus`.
 *   - El proveedor no puede quedarse sin ninguna marcada: la interfaz impide el estado
 *     imposible, en vez de avisar al final.
 *   - Su última selección se conserva en el dispositivo hasta que la cambie, y ese cambio
 *     es el que se conserva a partir de ahí.
 *   - Con varias unidades en la tarjeta hay que saber para cuál es la alerta: la tarjeta
 *     las pinta separadas por comas (`textoDeLasUnidadesDeLaAlerta`).
 *
 * Vive aquí, sin React y sin nada de la app (solo `lib/cache`), porque es la regla del
 * reparto y hay que poder ejecutarla con node en las pruebas.
 */

import { guardarCache, leerCache } from './cache';

/** Las unidades «normales», en el orden en que se pintan. */
export const UNIDADES: readonly string[] = [
  'Auto compacto',
  'Auto',
  'Camioneta',
  'Camioneta 3 filas',
];

/** Las del desplegable «Unidades grandes». */
export const UNIDADES_GRANDES: readonly string[] = ['Minivan', 'Minibús', 'Bus'];

/** Todas, para normalizar, ordenar y no repetir la lista en ningún sitio. */
export const TODAS_LAS_UNIDADES: readonly string[] = [...UNIDADES, ...UNIDADES_GRANDES];

/** Lo que sale marcado en «Nuevo servicio» la primera vez (pedido del usuario). */
export const UNIDADES_POR_DEFECTO: readonly string[] = ['Auto', 'Camioneta', 'Camioneta 3 filas'];

/** La unidad que se supone cuando un perfil no declara ninguna. */
export const UNIDAD_POR_DEFECTO = 'Auto';

/** Dónde se guarda la última selección del proveedor. */
export const CLAVE_UNIDADES_PREFERIDAS = 'unidades:preferidas';

/** «Se mantiene a lo largo del tiempo hasta ser modificada»: un año es de sobra. */
export const VIGENCIA_DE_LA_PREFERENCIA_MS = 365 * 24 * 60 * 60 * 1000;

/** Lo mínimo que hay que saber de una alerta para leer su requisito de unidad. */
export interface AlertaConUnidades {
  vehicle_requirements?: unknown;
  vehicle_type?: string | null;
}

/**
 * Deja cualquier forma guardada en una lista de unidades.
 *
 * Acepta la forma NUEVA (array), la VIEJA (un texto, «Auto» o «Auto, Camioneta») y
 * `'Todos'` o vacío, que significan «ninguna unidad concreta» → lista vacía.
 */
export function normalizarUnidades(valor: unknown): string[] {
  const crudo: unknown[] = Array.isArray(valor)
    ? valor
    : typeof valor === 'string'
      ? valor.split(',')
      : [];
  return ordenarUnidades(
    crudo
      .filter((unidad): unidad is string => typeof unidad === 'string')
      .map((unidad) => unidad.trim())
      .filter((unidad) => unidad.length > 0 && unidad !== 'Todos')
  );
}

/** Las unidades en el ORDEN de la pantalla, no en el orden en que se marcaron. */
export function ordenarUnidades(lista: readonly string[]): string[] {
  const conocidas = TODAS_LAS_UNIDADES.filter((unidad) => lista.includes(unidad));
  const desconocidas = lista.filter((unidad) => !TODAS_LAS_UNIDADES.includes(unidad));
  return [...conocidas, ...desconocidas];
}

/** Lo que pide una alerta. Lista vacía = sirve cualquiera (alertas viejas). */
export function unidadesDeLaAlerta(service: AlertaConUnidades | null | undefined): string[] {
  const requisito = service?.vehicle_requirements as { vehicle_type?: unknown } | undefined;
  return normalizarUnidades(requisito?.vehicle_type ?? service?.vehicle_type ?? null);
}

/**
 * ¿Este conductor puede tomar esta alerta? Basta con que coincida UNA unidad: el proveedor
 * marcó las que sirven. Una alerta sin unidades (o con «Todos») la puede tomar cualquiera.
 */
export function coincideConLaUnidad(
  service: AlertaConUnidades | null | undefined,
  misUnidades: string | readonly string[] | null | undefined
): boolean {
  const requeridas = unidadesDeLaAlerta(service);
  if (requeridas.length === 0) return true;
  const mias = normalizarUnidades(misUnidades ?? []);
  return mias.some((unidad) => requeridas.includes(unidad));
}

/** Las unidades del conductor tal como se guardan (sin declarar ninguna, la de defecto). */
export function unidadesDeMiPerfil(valor: unknown): string[] {
  const lista = normalizarUnidades(valor);
  return lista.length > 0 ? lista : [UNIDAD_POR_DEFECTO];
}

/** «Auto, Camioneta»: lo que se pinta en la tarjeta y en los perfiles. */
export function textoDeUnidades(unidades: unknown): string {
  return normalizarUnidades(unidades).join(', ');
}

/** El texto de las unidades de una alerta, ya listo para pintar. */
export function textoDeLasUnidadesDeLaAlerta(
  service: AlertaConUnidades | null | undefined
): string {
  return textoDeUnidades(unidadesDeLaAlerta(service));
}

/**
 * Marca o desmarca una unidad. **Nunca deja la lista vacía**: sin ninguna unidad marcada el
 * servicio no tendría a quién mostrarse, así que la última marcada se queda (la interfaz
 * impide el estado imposible en vez de avisar al final).
 */
export function alternarUnidad(actual: readonly string[], tocada: string): string[] {
  if (!actual.includes(tocada)) return ordenarUnidades([...actual, tocada]);
  if (actual.length <= 1) return [...actual];
  return actual.filter((unidad) => unidad !== tocada);
}

/** La última selección del proveedor (null si no hay ninguna guardada o venció). */
export async function leerUnidadesPreferidas(): Promise<string[] | null> {
  const guardadas = await leerCache<string[]>(
    CLAVE_UNIDADES_PREFERIDAS,
    VIGENCIA_DE_LA_PREFERENCIA_MS
  );
  const lista = normalizarUnidades(guardadas);
  return lista.length > 0 ? lista : null;
}

/** Guarda la última selección. Una selección vacía no se guarda nunca. */
export async function guardarUnidadesPreferidas(unidades: readonly string[]): Promise<void> {
  const lista = normalizarUnidades(unidades);
  if (lista.length === 0) return;
  await guardarCache(CLAVE_UNIDADES_PREFERIDAS, lista);
}
