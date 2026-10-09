import { useMemo } from 'react';

import { useAuth } from '../context/AuthContext';
import { useMockStore } from '../context/MockStoreContext';
import { useSeguimientoDelViaje } from '../hooks/useSeguimientoDelViaje';

/**
 * El latido del seguimiento en vivo (0049).
 *
 * Vive junto al navegador (no dentro de una pantalla) para que el reloj de los 15 s siga
 * corriendo aunque el conductor abra el chat, el perfil o cualquier otra pantalla.
 *
 * Busca el viaje EN CURSO del conductor conectado (asignado, todavía sin terminar): mientras
 * exista, publica su posición para la página del cliente. Si no existe, no hace nada — ni
 * siquiera pide la ubicación.
 */
export function SeguimientoEnVivo() {
  const { session } = useAuth();
  const { services } = useMockStore();

  const usuarioId = session?.user?.id ?? '';
  const viajeEnCurso = useMemo(() => {
    if (!usuarioId) return null;
    return (
      services.find(
        (s) =>
          s.assigned_driver_id === usuarioId &&
          s.status !== 'STATUS_OPEN' &&
          s.status !== 'STATUS_COMPLETED' &&
          s.status !== 'STATUS_CANCELLED'
      ) ?? null
    );
  }, [services, usuarioId]);

  useSeguimientoDelViaje(viajeEnCurso, Boolean(viajeEnCurso));
  return null;
}
