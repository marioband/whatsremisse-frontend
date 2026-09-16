import { Application } from '../types';

export type EstadoDeMiPostulacion = 'NINGUNA' | 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA';

/**
 * Estado de MI postulación en un servicio.
 *
 * El conductor solo puede leer sus propias filas de `applications` (RLS de 0001),
 * así que esto es todo lo que necesita para saber si sigue dentro de la
 * conversación: `NINGUNA` = todavía no se postuló.
 */
export function estadoDeMiPostulacion(
  applications: Application[],
  serviceId: string,
  userId: string
): EstadoDeMiPostulacion {
  const fila = applications.find((a) => a.serviceId === serviceId && a.driverId === userId);
  if (!fila) return 'NINGUNA';
  if (fila.status === 'REJECTED') return 'RECHAZADA';
  return fila.status === 'APPROVED' ? 'ACEPTADA' : 'PENDIENTE';
}

/**
 * ¿Hay que cerrar la conversación para este conductor?
 *
 * Sí cuando el proveedor lo rechazó —o perdió el puesto frente a otro conductor,
 * que la base marca `REJECTED` igual— y él no es el conductor asignado. El
 * conductor asignado nunca se queda fuera, aunque su fila diga otra cosa.
 *
 * Volver a postularse reactiva la MISMA fila (`postularAServicio` hace upsert y la
 * deja en PENDING), así que el chat se reabre solo: no hay que borrar nada.
 */
export function chatCerradoParaElConductor(datos: {
  applications: Application[];
  serviceId: string;
  userId: string;
  asignadoAMi: boolean;
}): boolean {
  if (datos.asignadoAMi) return false;
  return estadoDeMiPostulacion(datos.applications, datos.serviceId, datos.userId) === 'RECHAZADA';
}

/** Texto del aviso que ve el conductor rechazado (una sola acción: salir del chat). */
export const AVISO_DE_RECHAZO = {
  titulo: 'Servicio rechazado',
  cuerpo:
    'El proveedor ya no cuenta con tu postulación en este servicio, así que la conversación se cierra. ' +
    'Si el servicio sigue disponible en tus grupos puedes volver a postularte.',
  boton: 'Aceptar',
};
