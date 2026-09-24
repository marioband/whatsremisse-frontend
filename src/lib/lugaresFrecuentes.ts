/**
 * Lugares que el buscador de direcciones ofrece ANTES de teclear.
 *
 * Dos fuentes, las dos LOCALES (no llaman a Google: coste $0):
 *   1. `LUGARES_VERIFICADOS`: sitios con su punto exacto ya conocido (el aeropuerto).
 *   2. Las direcciones que el propio usuario repite, contadas de sus servicios.
 *
 * Regla de aparición (pedido del usuario, 24-09-2026): «al seleccionar la barra de
 * escritura salga primero Aeropuerto» → con el campo VACÍO salen primero los
 * verificados y después los que repite; mientras escribe salen solo si lo escrito
 * coincide y no hay nada mejor (las sugerencias de Google mandan cuando existen).
 *
 * Módulo PURO (cero imports): se prueba en Node sin la app.
 */

/** Un servicio ya publicado, en lo que a este módulo le importa (estructura, no tipo de la app). */
export interface ServicioDelHistorial {
  origin_address?: string | null;
  destination_address?: string | null;
  origin_lat?: number | null;
  origin_lng?: number | null;
  destination_lat?: number | null;
  destination_lng?: number | null;
}

export interface LugarGuardado {
  /** Texto que se escribe en el campo al elegirlo. */
  texto: string;
  /** Segunda línea de la fila: distrito, o cuántas veces lo usó. */
  detalle: string;
  lat: number | null;
  lng: number | null;
  /** Veces usado por este usuario (0 en los verificados: no salen del historial). */
  veces: number;
  /** true = ya tiene punto exacto: no hay que resolverlo y no cuesta ninguna llamada. */
  exacto: boolean;
  /** Otras formas de nombrarlo (solo los verificados lo traen). */
  alias?: readonly string[];
}

/**
 * Sitios con punto conocido. El orden de esta lista es el orden en pantalla.
 *
 * Las coordenadas del aeropuerto las dio el usuario (24-09-2026): son su dato, no
 * contenido de Google, así que no les aplica la regla de los 30 días.
 */
export const LUGARES_VERIFICADOS: readonly LugarGuardado[] = [
  {
    texto: 'Aeropuerto Jorge Chávez',
    detalle: 'Callao, Lima',
    lat: -12.029825,
    lng: -77.116285,
    veces: 0,
    exacto: true,
    alias: [
      'aeropuerto',
      'aeropuerto internacional',
      'jorge chavez',
      'aeropuerto lima',
      'aeropuerto callao',
      'lim',
    ],
  },
];

/** Menos de esto no se considera coincidencia (evita que «a» saque todo). */
const MINIMO_PARA_COINCIDIR = 3;

/** Una dirección de menos de 4 letras no es una dirección. */
const MINIMO_DE_DIRECCION = 4;

/** Cuántos servicios del historial se miran (los que ya están en memoria). */
const MAXIMO_SERVICIOS_A_MIRAR = 200;

/**
 * Texto comparable: sin tildes, sin mayúsculas, sin puntuación y con un solo
 * espacio. Se usa para agrupar la MISMA dirección escrita de formas distintas.
 */
export function normalizarDireccion(texto: string): string {
  return (texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** ¿Lo escrito se refiere a este lugar? (basta con que uno contenga al otro) */
export function coincideConLugar(texto: string, lugar: LugarGuardado): boolean {
  const escrito = normalizarDireccion(texto);
  if (escrito.length < MINIMO_PARA_COINCIDIR) return false;
  const formas = [lugar.texto, ...(lugar.alias || [])].map(normalizarDireccion);
  return formas.some(
    (forma) => forma.length > 0 && (forma.includes(escrito) || escrito.includes(forma))
  );
}

/** Punto válido: números finitos y que no sea el (0,0) con el que la app marca «sin punto». */
function puntoValido(
  lat?: number | null,
  lng?: number | null
): { lat: number; lng: number } | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

/**
 * Las direcciones que este usuario REPITE (origen y destino de sus servicios).
 * Una sola vez no es costumbre: entra a partir de la segunda.
 */
export function direccionesFrecuentes(
  servicios: readonly ServicioDelHistorial[],
  limite = 4
): LugarGuardado[] {
  const cuenta = new Map<
    string,
    { texto: string; veces: number; punto: { lat: number; lng: number } | null }
  >();

  servicios.slice(0, MAXIMO_SERVICIOS_A_MIRAR).forEach((servicio) => {
    const extremos: [string | null | undefined, { lat: number; lng: number } | null][] = [
      [servicio.origin_address, puntoValido(servicio.origin_lat, servicio.origin_lng)],
      [
        servicio.destination_address,
        puntoValido(servicio.destination_lat, servicio.destination_lng),
      ],
    ];
    extremos.forEach(([direccion, punto]) => {
      const visible = String(direccion || '').trim();
      if (visible.length < MINIMO_DE_DIRECCION) return;
      const clave = normalizarDireccion(visible);
      if (!clave) return;
      const actual = cuenta.get(clave);
      if (actual) {
        actual.veces += 1;
        // Si una de las veces traía punto exacto, ese punto sirve para todas.
        if (!actual.punto && punto) actual.punto = punto;
        return;
      }
      cuenta.set(clave, { texto: visible, veces: 1, punto });
    });
  });

  return [...cuenta.values()]
    .filter((entrada) => entrada.veces > 1)
    .sort((a, b) => b.veces - a.veces || a.texto.localeCompare(b.texto))
    .slice(0, limite)
    .map((entrada) => ({
      texto: entrada.texto,
      detalle: `Lo usaste ${entrada.veces} veces`,
      lat: entrada.punto?.lat ?? null,
      lng: entrada.punto?.lng ?? null,
      veces: entrada.veces,
      exacto: Boolean(entrada.punto),
    }));
}

export interface OpcionesDelCampo {
  texto: string;
  servicios?: readonly ServicioDelHistorial[];
  /** Google ya devolvió sugerencias (o las está pidiendo) para lo escrito. */
  haySugerenciasDeGoogle?: boolean;
  verificados?: readonly LugarGuardado[];
  limite?: number;
}

/** ¿Son el mismo sitio dicho de dos formas? (para no repetir la fila) */
function mismaDireccion(a: string, b: string): boolean {
  const uno = normalizarDireccion(a);
  const otro = normalizarDireccion(b);
  if (!uno || !otro) return false;
  if (uno === otro) return true;
  // Solo con textos largos: «Callao» no es «Aeropuerto Jorge Chávez» aunque sea su distrito.
  const MINIMO = 8;
  return (
    (uno.length >= MINIMO && otro.includes(uno)) || (otro.length >= MINIMO && uno.includes(otro))
  );
}

/**
 * Las filas locales que corresponden a lo que hay en el campo, en orden.
 * Vacío significa «aquí manda Google» (o no hay nada que ofrecer).
 */
export function lugaresParaElCampo({
  texto,
  servicios = [],
  haySugerenciasDeGoogle = false,
  verificados = LUGARES_VERIFICADOS,
  limite = 4,
}: OpcionesDelCampo): LugarGuardado[] {
  const escrito = normalizarDireccion(texto);
  // Lo que repite el usuario pierde la fila si ya está entre los verificados:
  // el aeropuerto no puede salir dos veces (verificado y «lo usaste 3 veces»).
  const frecuentes = direccionesFrecuentes(servicios, limite).filter(
    (lugar) => !verificados.some((verificado) => mismaDireccion(lugar.texto, verificado.texto))
  );

  // Campo vacío (o casi): primero los verificados, después lo que repite.
  if (escrito.length < MINIMO_PARA_COINCIDIR) {
    return [...verificados, ...frecuentes].slice(0, verificados.length + limite);
  }

  if (haySugerenciasDeGoogle) return [];

  return [...verificados, ...frecuentes].filter((lugar) => coincideConLugar(texto, lugar));
}
