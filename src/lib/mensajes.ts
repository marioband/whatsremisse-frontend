/**
 * Reglas de edición y eliminación de mensajes, compartidas por el chat del
 * servicio (conductor <-> proveedor) y el chat de grupo.
 *
 * El usuario las fijó así:
 *   * Cada quien edita y elimina SOLO sus propios mensajes.
 *   * Editar solo dentro de los primeros 15 minutos (igual que WhatsApp);
 *     eliminar no tiene límite.
 *   * Al editar, lo único que se declara es que el mensaje fue editado: lo que
 *     decía antes no se ve en ninguna parte.
 *
 * Módulo PURO a propósito (sin React y sin acceso a la red; solo importa
 * `datetime`, que también lo es): así las reglas se pueden ejecutar con node sobre
 * casos reales. Quien abre el menú es `lib/menuDeMensaje.ts`.
 *
 * La misma ventana de 15 minutos está en la base (migración 0019): si cambia la
 * regla, hay que cambiarla en los dos sitios.
 */
import { horaPegada } from './datetime';

export const MINUTOS_PARA_EDITAR = 15;
export const MS_PARA_EDITAR = MINUTOS_PARA_EDITAR * 60 * 1000;

/** ¿El mensaje está todavía dentro de la ventana para poder editarlo? */
export function dentroDeLaVentanaDeEdicion(
  mensaje: { created_at: string },
  ahora: number = Date.now()
): boolean {
  const creado = new Date(mensaje.created_at).getTime();
  if (!Number.isFinite(creado)) return false;
  return ahora - creado <= MS_PARA_EDITAR;
}

/**
 * Ids que la app se inventa antes de guardar (envío optimista, avisos del
 * sistema, mensaje de bienvenida): no existen en la base, así que no se pueden
 * editar ni eliminar ahí.
 */
export function idSinGuardar(id: string): boolean {
  return id.startsWith('msg-') || id.startsWith('sys-') || id === 'welcome';
}

/** Aviso del sistema que declara la edición (nunca muestra el texto anterior). */
export function avisoDeEdicion(nombre: string): string {
  return `Sistema: ${nombre} editó un mensaje.`;
}

/** Aviso del sistema que declara la eliminación. */
export function avisoDeEliminacion(nombre: string): string {
  return `Sistema: ${nombre} eliminó un mensaje.`;
}

/**
 * Los tres avisos del HITO del viaje, en orden (1 ubicado, 2 iniciado, 3 finalizado).
 * Son la ÚNICA fuente del texto: los usa el chat al reportar el hito y también el que
 * decide cuáles llevan la hora.
 */
export const AVISOS_DEL_HITO = [
  'Sistema: Conductor en el punto de origen (Ubicado).',
  'Sistema: Viaje iniciado.',
  'Sistema: Viaje finalizado.',
];

/** El aviso del hito `paso`. Fuera de 1..3 devuelve el extremo más cercano. */
export function avisoDelHito(paso: number): string {
  const indice = Math.min(Math.max(paso, 1), AVISOS_DEL_HITO.length) - 1;
  return AVISOS_DEL_HITO[indice];
}

/**
 * Los avisos del viaje cuando hay VARIAS paradas: el conductor reporta parada por parada
 * («camino al destino 2»), no los tres hitos de siempre. Pedido del usuario el 19-09-2026.
 */
export const AVISO_DE_PARADA = /^Sistema: Conductor camino al destino (\d+)( \(.+\))?\.$/;

/**
 * El aviso del paso `paso` en un viaje de `paradas` paradas (el último paso cierra el viaje).
 * `destino` es el nombre de la parada; si no se conoce, el aviso sale sin él.
 */
export function avisoDeParada(paso: number, paradas: number, destino?: string): string {
  const total = paradas + 1;
  const numero = Math.min(Math.max(Math.trunc(paso), 1), total);
  if (numero >= total) return AVISOS_DEL_HITO[2];
  const nombre = (destino || '').trim();
  return `Sistema: Conductor camino al destino ${numero}${nombre ? ` (${nombre})` : ''}.`;
}

/** ¿Este texto es un aviso del viaje (los tres de siempre o los de las paradas)? */
export function esAvisoDelHito(content: string): boolean {
  const texto = (content || '').trim();
  return AVISOS_DEL_HITO.includes(texto) || AVISO_DE_PARADA.test(texto);
}

/**
 * Lo que se PINTA de un aviso del sistema en el chat.
 *
 * Los tres hitos del viaje llevan la hora pegada al final —"Sistema: Viaje iniciado.
 * 9:30pm"—, pedido por el usuario el 18-09-2026. La hora sale de `created_at` (la que
 * guarda la BASE, no el reloj del dispositivo) por dos motivos: es la hora real del
 * servidor y así también aparece en los avisos que ya estaban guardados. Los demás
 * avisos del sistema (pagos, ediciones, eliminaciones) se pintan tal cual.
 */
export function textoDelSistema(mensaje: { content: string; created_at?: string | null }): string {
  if (!esAvisoDelHito(mensaje.content)) return mensaje.content;
  const cuando = new Date(mensaje.created_at || '');
  if (Number.isNaN(cuando.getTime())) return mensaje.content;
  return `${mensaje.content} ${horaPegada(cuando)}`;
}

export const PLACEHOLDER_EDICION = 'Edita tu mensaje...';
export const TITULO_EDITANDO = 'Editando mensaje';
export const AVISO_VENTANA_VENCIDA = `Ya pasaron los ${MINUTOS_PARA_EDITAR} minutos: este mensaje solo se puede eliminar.`;
export const AVISO_MENSAJE_ENVIANDO = 'El mensaje todavía se está enviando. Espera un segundo.';
export const CONFIRMACION_ELIMINAR =
  'Se eliminará de la conversación para todos y no se podrá recuperar.';
export const AVISO_MIGRACION_0019 =
  'Para editar y eliminar mensajes falta aplicar la migración 0019 ' +
  '(supabase/migrations/0019_editar_y_eliminar_mensajes.sql) en Supabase Studio.';
export const AVISO_SIN_CAMBIOS = 'El mensaje quedó igual: no se declaró ninguna edición.';

/**
 * ¿El mensaje que acabo de intentar guardar ya está en la conversación?
 *
 * Se usa cuando la escritura se quedó SIN RESPUESTA (fallo de transporte): la fila pudo
 * llegar igualmente a la base y no hay identificador en común, porque la app se inventa
 * el id antes de guardar (`msg-…`, `sys-…`). Se miran solo las últimas filas y se compara
 * el texto, el tipo y quién lo firma — NUNCA las horas, porque el reloj del dispositivo y
 * el del servidor no tienen por qué coincidir, y una comparación de horas fallida haría
 * reintentar un mensaje que ya está guardado (duplicado).
 *
 * Devuelve la fila guardada (para quedarse con su id y su hora reales) o null.
 */
export function mensajeYaGuardado<
  T extends { content: string; type?: string; sender_id?: string | null },
>(
  filas: T[],
  local: { content: string; type?: string; sender_id?: string | null },
  ultimas = 5
): T | null {
  const recientes = filas.slice(-Math.max(1, ultimas));
  for (let i = recientes.length - 1; i >= 0; i -= 1) {
    const fila = recientes[i];
    if (fila.content !== local.content) continue;
    if ((fila.type || 'TEXT') !== (local.type || 'TEXT')) continue;
    if ((fila.sender_id || null) !== (local.sender_id || null)) continue;
    return fila;
  }
  return null;
}

/**
 * Qué se puede hacer con un mensaje propio AHORA. La interfaz no ofrece una
 * acción imposible: fuera de la ventana de 15 minutos solo queda eliminar, y el
 * menú lo dice.
 */
export function accionesDelMensaje(
  mensaje: { created_at: string },
  ahora: number = Date.now()
): { puedeEditar: boolean; puedeEliminar: boolean; textoDelMenu: string } {
  const puedeEditar = dentroDeLaVentanaDeEdicion(mensaje, ahora);
  return {
    puedeEditar,
    puedeEliminar: true,
    textoDelMenu: puedeEditar ? 'Elige una acción.' : AVISO_VENTANA_VENCIDA,
  };
}

/**
 * La vista previa del último mensaje para la tarjeta de **Mis grupos** (23-09-2026).
 *
 * El usuario quiere la tarjeta como WhatsApp: el nombre, y debajo hasta DOS líneas del último
 * mensaje con su autor («Gregory Medina: Gracias Mario»). De los mensajes que no son texto se enseña
 * QUÉ son (una nota de voz no tiene texto que enseñar), y de los míos el autor es «Tú».
 *
 * Es una función pura a propósito: la regla del texto se prueba con node, sin montar la pantalla.
 */
export function vistaPreviaDelMensaje(mensaje: {
  tipo?: string | null;
  texto?: string | null;
  autor?: string | null;
  esMio?: boolean;
}): string {
  const tipo = (mensaje.tipo || 'TEXT').toUpperCase();
  const cuerpo = (() => {
    if (tipo === 'TEXT' || tipo === 'SYSTEM') {
      // Un mensaje con saltos de línea se aplana: en la tarjeta solo caben dos líneas.
      return (mensaje.texto || '').replace(/\s+/g, ' ').trim();
    }
    if (tipo === 'VOICE') return 'Mensaje de voz';
    if (tipo === 'PHOTO') return 'Foto';
    if (tipo === 'LOCATION') return 'Ubicación';
    if (tipo === 'CONTACT') return 'Contacto';
    return (mensaje.texto || '').replace(/\s+/g, ' ').trim();
  })();
  if (!cuerpo) return '';
  const quien = mensaje.esMio ? 'Tú' : (mensaje.autor || '').trim();
  return quien ? `${quien}: ${cuerpo}` : cuerpo;
}
