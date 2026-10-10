import { useEffect, useState } from 'react';

import { pedidosDeUbicacionPendientes } from './database';

/**
 * El aviso de «Ver ubicación» del conductor (0053, 10-10-2026): qué servicios me están
 * pidiendo la ubicación AHORA (PEDIDO sin aceptar y sin caducar). Es nuestro «push» sin push:
 * la tarjeta del servicio en la lista lo enseña y el chat es donde se responde.
 *
 * Vive en un módulo (no en el store) para que CUALQUIER tarjeta de cualquier lista pueda
 * preguntarlo sin pasar props: la lista se refresca cuando el store recarga (`load`), que es
 * también cuando el respaldo periódico la trae.
 */

let pendientes = new Set<string>();
const escuchas = new Set<() => void>();

/** Vuelve a preguntar a la base qué servicios me piden la ubicación. Nunca lanza. */
export async function refrescarPedidosDeUbicacionPendientes(): Promise<void> {
  try {
    const ids = await pedidosDeUbicacionPendientes();
    pendientes = new Set(ids);
    escuchas.forEach((avisa) => avisa());
  } catch {
    // Es un aviso, no una función crítica: si la base no responde, se queda como estaba.
  }
}

/** ¿Este servicio me está pidiendo la ubicación? (para la tarjeta de la lista) */
export function usePedidoDeUbicacionPendiente(serviceId: string): boolean {
  const [pendiente, setPendiente] = useState(pendientes.has(serviceId));
  useEffect(() => {
    const avisa = () => setPendiente(pendientes.has(serviceId));
    avisa();
    escuchas.add(avisa);
    return () => {
      escuchas.delete(avisa);
    };
  }, [serviceId]);
  return pendiente;
}
