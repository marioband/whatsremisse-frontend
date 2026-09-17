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
 * Módulo PURO a propósito (sin imports, sin React): así las reglas se pueden
 * ejecutar con node sobre casos reales. Quien abre el menú es
 * `lib/menuDeMensaje.ts`.
 *
 * La misma ventana de 15 minutos está en la base (migración 0019): si cambia la
 * regla, hay que cambiarla en los dos sitios.
 */
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
