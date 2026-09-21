/**
 * A dónde va la flecha «atrás» de un chat.
 *
 * POR QUÉ EXISTE: las conversaciones tienen dirección propia —`/chat/<servicio>`, `/grupo/<grupo>`
 * (ver `navigation/RootNavigator.tsx`)—, así que cuando el navegador recarga la app estando ahí
 * (pasa al volver de Google Maps: iOS descarga la pestaña de la app), la app ARRANCA con esa
 * conversación como única pantalla del historial. Entonces `goBack()` no tiene a dónde ir y la
 * flecha queda muerta: el usuario la toca y no pasa nada (reporte del 20-09-2026, en el chat de
 * grupo; el de servicio tiene el mismo camino y el mismo fallo).
 *
 * La regla: si hay historial, se vuelve atrás como siempre; si no lo hay, se vuelve al APARTADO al
 * que pertenece esa conversación, que nunca puede quedar sin salida.
 *
 * Es una función pura para poder comprobarla sin navegador.
 */
export type DestinoDeVuelta = 'atras' | 'inicio' | 'grupos';

export function destinoDeVuelta(
  puedeVolver: boolean,
  clase: 'servicio' | 'grupo'
): DestinoDeVuelta {
  if (puedeVolver) return 'atras';
  // Un grupo vive en «Mis grupos»; un servicio, en el inicio del conductor o del proveedor.
  return clase === 'grupo' ? 'grupos' : 'inicio';
}

/** El apartado (rol) de la app al que corresponde cada destino. */
export function rolDelDestino(destino: DestinoDeVuelta): 'GROUP_OWNER' | null {
  return destino === 'grupos' ? 'GROUP_OWNER' : null;
}
