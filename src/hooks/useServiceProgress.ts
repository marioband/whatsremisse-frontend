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

interface UseServiceProgressResult {
  currentStep: ServiceStep;
  progressIndex: number;
}

/** El último hito del viaje: a partir de aquí solo queda el pago. */
export const ULTIMO_HITO_VIAJE = 3;

export function useServiceProgress(service: ServiceAlert | undefined): UseServiceProgressResult {
  return useMemo(() => {
    if (!service) return { currentStep: 'IN_PROGRESS' as ServiceStep, progressIndex: 0 };

    const paso = service.driver_progress_step ?? 0;
    if (paso >= ULTIMO_HITO_VIAJE) return { currentStep: 'PAGO' as ServiceStep, progressIndex: 2 };

    return { currentStep: 'IN_PROGRESS' as ServiceStep, progressIndex: paso };
  }, [service]);
}
