import { useMemo } from 'react';

import { ServiceAlert } from '../types';

export type ServiceStep = 'IN_PROGRESS' | 'COMMISSION_PAID' | 'PAYMENT_RECEIVED' | 'FINISHED';

interface UseServiceProgressResult {
  currentStep: ServiceStep;
  progressIndex: number;
}

export function useServiceProgress(service: ServiceAlert | undefined): UseServiceProgressResult {
  return useMemo(() => {
    if (!service) return { currentStep: 'IN_PROGRESS' as ServiceStep, progressIndex: 0 };

    const step = service.driver_progress_step ?? 0;
    if (step === 0) return { currentStep: 'IN_PROGRESS' as ServiceStep, progressIndex: 0 };
    if (step === 1) return { currentStep: 'IN_PROGRESS' as ServiceStep, progressIndex: 1 };
    if (step === 2) return { currentStep: 'IN_PROGRESS' as ServiceStep, progressIndex: 2 };
    if (!service.settlement_enabled)
      return { currentStep: 'IN_PROGRESS' as ServiceStep, progressIndex: 2 };
    if (!service.commission_paid)
      return { currentStep: 'COMMISSION_PAID' as ServiceStep, progressIndex: 0 };
    if (!service.driver_payment_received)
      return { currentStep: 'PAYMENT_RECEIVED' as ServiceStep, progressIndex: 0 };

    return { currentStep: 'FINISHED' as ServiceStep, progressIndex: 0 };
  }, [service]);
}
