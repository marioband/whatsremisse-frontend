import { Alert, AlertButton } from './alert';
import { accionesDelMensaje } from './mensajes';

/**
 * Menú de acciones de un mensaje propio (hoja de acciones en web cuando hay tres
 * botones; `window.confirm` cuando hay dos y uno es "Cancelar").
 *
 * Cuando la ventana de edición ya venció NO se ofrece editar, y el texto del menú
 * explica por qué. Las reglas viven en `lib/mensajes.ts` (módulo puro, probado).
 */
export function abrirMenuDeMensaje(params: {
  created_at: string;
  alEditar: () => void;
  alEliminar: () => void;
}) {
  const { puedeEditar, textoDelMenu } = accionesDelMensaje(params);
  const botones: AlertButton[] = [];

  if (puedeEditar) {
    botones.push({ text: 'Editar mensaje', onPress: params.alEditar });
  }
  botones.push({
    text: 'Eliminar mensaje',
    style: 'destructive',
    onPress: params.alEliminar,
  });
  botones.push({ text: 'Cancelar', style: 'cancel' });

  Alert.alert('Mensaje', textoDelMenu, botones);
}
