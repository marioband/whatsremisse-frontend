import { useMemo } from 'react';

import { ServiceAlert } from '../types';

/**
 * Etapa del servicio dentro del chat:
 *   - IN_PROGRESS: el conductor reporta el viaje (Ubicado → En proceso → Finalizado).
 *   - PAGO: el viaje terminó y empieza el ciclo de pago entre conductor y proveedor
 *     (declaración → aceptación → confirmación). Las funciones de `lib/pagoServicio.ts`
 *     deciden qué se ve en cada sub-estado.
 */
export type ServiceStep = 'IN_PROGRESS' | 'PAGO';

interface EtapaDelServicio {
  currentStep: ServiceStep;
  progressIndex: number;
}

/** El último hito del viaje: a partir de aquí solo queda el pago. */
export const ULTIMO_HITO_VIAJE = 3;

/**
 * Etapa del servicio. Es la ÚNICA fuente de verdad de qué zona se pinta en el
 * chat (el deslizamiento del viaje o el cuadre de pagos): antes cada zona tenía
 * su propia condición y podían contradecirse — el deslizamiento y el cuadre
 * llegaron a verse a la vez.
 *
 * El cierre del viaje llega por dos señales equivalentes (0012 escribe las dos:
 * `driver_progress_step = 3` y `status = STATUS_COMPLETED`); basta con una.
 */
export function etapaDelServicio(
  service: ServiceAlert | undefined,
  /**
   * El paso que CIERRA el viaje: 3 en el servicio de un solo destino; con varias paradas es N+1
   * (los pasos «Ir a destino k» y el final). Ver `lib/paradasDelServicio.ts`.
   */
  ultimoHito: number = ULTIMO_HITO_VIAJE
): EtapaDelServicio {
  if (!service) return { currentStep: 'IN_PROGRESS', progressIndex: 0 };

  const paso = service.driver_progress_step ?? 0;
  if (paso >= ultimoHito || service.status === 'STATUS_COMPLETED') {
    return { currentStep: 'PAGO', progressIndex: 2 };
  }

  return { currentStep: 'IN_PROGRESS', progressIndex: paso };
}

export function useServiceProgress(
  service: ServiceAlert | undefined,
  ultimoHito: number = ULTIMO_HITO_VIAJE
): EtapaDelServicio {
  return useMemo(() => etapaDelServicio(service, ultimoHito), [service, ultimoHito]);
}
