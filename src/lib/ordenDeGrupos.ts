/**
 * Orden y color de las tarjetas de **Mis grupos** (pedido del usuario, 18-09-2026).
 *
 * El orden es una prioridad, no cuatro listas: primero los grupos de los que soy
 * **propietario**, después los que **administro**, luego los que marqué como
 * **favorito** y al final los que solo **integro**. Un grupo cae en la PRIMERA
 * categoría que le toca (un grupo que administro y además marqué como favorito sale
 * con el color de administrador, que es la información más fuerte), y dentro de cada
 * categoría se ordena por nombre, como en la lista de integrantes.
 *
 * 23-09-2026 — el usuario quitó los colores: «los grupos ya no se dividirán por colores, todos serán
 * del mismo color que se usa en los grupos a los que el usuario integra (gris claro)». El ORDEN sigue
 * siendo el mismo y sigue viviendo aquí; lo único que cambia es que las cuatro categorías se pintan
 * igual. Así la categoría se lee por los ICONOS de la tarjeta (candado/silenciado, pin de fijado), no
 * por el fondo.
 *
 * Vive aquí, sin React, porque es la regla del reparto y hay que poder ejecutarla con
 * node: la pantalla no decide colores ni orden por su cuenta.
 */
import { GRUPO_INTEGRANTE } from './colors';

/** Lo mínimo que necesita un grupo para ordenarse y pintarse. */
export interface GrupoParaLaLista {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
  favorite?: boolean;
  /**
   * Cuándo llegó el último mensaje del grupo (en milisegundos, de `grupos_ultimo_mensaje`).
   * Solo manda en los grupos que solo integro. Sin dato (grupo sin mensajes) va al final.
   */
  ultimoMensajeAt?: number | null;
}

export type CategoriaDeGrupo = 'PROPIETARIO' | 'ADMIN' | 'FAVORITO' | 'INTEGRANTE';

/** De arriba abajo en la pantalla. */
export const ORDEN_DE_LAS_CATEGORIAS: readonly CategoriaDeGrupo[] = [
  'PROPIETARIO',
  'ADMIN',
  'FAVORITO',
  'INTEGRANTE',
];

/**
 * El color de la tarjeta: el MISMO para todas las categorías (23-09-2026).
 *
 * Es el gris claro con el que ya se pintaban los grupos que solo integro (`GRUPO_INTEGRANTE`,
 * `#F2F2F2`). Se deja el mapa por categoría —y no una sola constante— porque la prueba del reparto y
 * el resto del proyecto lo consultan por nombre.
 */
export const COLOR_DE_LA_CATEGORIA: Record<CategoriaDeGrupo, string> = {
  PROPIETARIO: GRUPO_INTEGRANTE,
  ADMIN: GRUPO_INTEGRANTE,
  FAVORITO: GRUPO_INTEGRANTE,
  INTEGRANTE: GRUPO_INTEGRANTE,
};

/** En qué categoría cae un grupo (la primera que le corresponda). */
export function categoriaDelGrupo(grupo: GrupoParaLaLista): CategoriaDeGrupo {
  if (grupo.role === 'owner') return 'PROPIETARIO';
  if (grupo.role === 'admin') return 'ADMIN';
  if (grupo.favorite) return 'FAVORITO';
  return 'INTEGRANTE';
}

/** El color de fondo de la tarjeta de ese grupo. */
export function colorDeLaTarjeta(grupo: GrupoParaLaLista): string {
  return COLOR_DE_LA_CATEGORIA[categoriaDelGrupo(grupo)];
}

/** El peso de cada categoría (para ordenar sin depender del orden del array). */
function pesoDeLaCategoria(categoria: CategoriaDeGrupo): number {
  return ORDEN_DE_LAS_CATEGORIAS.indexOf(categoria);
}

/**
 * La lista que se pinta: por categoría y, dentro de cada una, por nombre — salvo en los grupos
 * que solo integro, que van por último mensaje recibido (20-09-2026).
 *
 * No modifica el array que recibe (el del store): devuelve una copia ordenada.
 */
export function ordenarGrupos<T extends GrupoParaLaLista>(grupos: readonly T[]): T[] {
  return [...grupos].sort((a, b) => {
    const categoriaA = categoriaDelGrupo(a);
    const pesoA = pesoDeLaCategoria(categoriaA);
    const pesoB = pesoDeLaCategoria(categoriaDelGrupo(b));
    if (pesoA !== pesoB) return pesoA - pesoB;

    // Los que solo integro: manda el último mensaje RECIBIDO (lo más reciente, arriba).
    if (categoriaA === 'INTEGRANTE') {
      const cuandoA = a.ultimoMensajeAt ?? 0;
      const cuandoB = b.ultimoMensajeAt ?? 0;
      if (cuandoA !== cuandoB) return cuandoB - cuandoA;
    }

    return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  });
}

/**
 * Cuántos grupos hay de cada categoría (en el orden de la pantalla).
 * Lo usa la prueba para comprobar el reparto sin mirar la pantalla.
 */
export function resumenDeGrupos(
  grupos: readonly GrupoParaLaLista[]
): { categoria: CategoriaDeGrupo; cantidad: number; color: string }[] {
  return ORDEN_DE_LAS_CATEGORIAS.map((categoria) => ({
    categoria,
    cantidad: grupos.filter((g) => categoriaDelGrupo(g) === categoria).length,
    color: COLOR_DE_LA_CATEGORIA[categoria],
  }));
}
