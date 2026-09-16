-- ============================================
-- 0013: pago del servicio entre conductor y proveedor
-- ============================================
-- Ciclo (fijado con el usuario):
--   1. Al quedar el servicio Finalizado, el conductor declara:
--        DRIVER_PAYS_PROVIDER = "Yo pago"      (el cliente le pagó a él; le debe al proveedor)
--        PROVIDER_PAYS_DRIVER = "Me deben"     (el proveedor le paga el servicio)
--      con el monto (sugerido la tarifa de la alerta, editable).
--   2. El proveedor acepta o rechaza el monto.
--   3. Aceptado queda "Pago en camino"; la transferencia se hace por fuera y
--      CONFIRMA QUIEN RECIBE EL DINERO:
--        DRIVER_PAYS_PROVIDER → recibe el proveedor → confirma el proveedor
--        PROVIDER_PAYS_DRIVER → recibe el conductor → confirma el conductor
--   4. Al confirmar, el servicio queda "pagado y cerrado".
--
-- Reglas: quien debe pagar ve los datos de pago de quien debe recibir (nunca al
-- revés) y solo el receptor confirma. Las escrituras van por funciones
-- SECURITY DEFINER porque el conductor no puede escribir `service_alerts` (RLS,
-- ver 0012) y porque el ciclo tiene que validarse en la base, no en la UI.
-- Reemplaza a `commission_paid` / `driver_payment_received` / `settlement_enabled`
-- (esas columnas se quedan sin uso; no se borran para no romper builds viejos).

-- ============================================
-- Columnas del pago
-- ============================================
ALTER TABLE public.service_alerts
  ADD COLUMN IF NOT EXISTS pago_estado TEXT NOT NULL DEFAULT 'SIN_DECLARAR',
  ADD COLUMN IF NOT EXISTS pago_direccion TEXT,
  ADD COLUMN IF NOT EXISTS pago_monto NUMERIC,
  ADD COLUMN IF NOT EXISTS pago_declarado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pago_aceptado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pago_aceptado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pago_confirmado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pago_confirmado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

DO $$
BEGIN
  ALTER TABLE public.service_alerts
    ADD CONSTRAINT service_alerts_pago_estado_check
    CHECK (pago_estado IN ('SIN_DECLARAR', 'DECLARADO', 'RECHAZADO', 'ACEPTADO', 'CONFIRMADO'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.service_alerts
    ADD CONSTRAINT service_alerts_pago_direccion_check
    CHECK (pago_direccion IS NULL
           OR pago_direccion IN ('DRIVER_PAYS_PROVIDER', 'PROVIDER_PAYS_DRIVER'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 1) Declaración (solo el conductor asignado, con el viaje finalizado)
-- ============================================
CREATE OR REPLACE FUNCTION public.declarar_pago_servicio(
  p_service_id UUID,
  p_direccion TEXT,
  p_monto NUMERIC
)
RETURNS public.service_alerts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fila public.service_alerts;
BEGIN
  IF p_direccion NOT IN ('DRIVER_PAYS_PROVIDER', 'PROVIDER_PAYS_DRIVER') THEN
    RAISE EXCEPTION 'Dirección de pago inválida: %', p_direccion;
  END IF;

  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor que cero (recibido: %)', p_monto;
  END IF;

  UPDATE public.service_alerts s
     SET pago_direccion = p_direccion,
         pago_monto = p_monto,
         pago_estado = 'DECLARADO',
         pago_declarado_at = now(),
         -- Una declaración nueva (o corregida tras un rechazo) limpia lo anterior.
         pago_aceptado_at = NULL,
         pago_aceptado_por = NULL,
         pago_confirmado_at = NULL,
         pago_confirmado_por = NULL,
         updated_at = now()
   WHERE s.id = p_service_id
     AND s.assigned_driver_id = auth.uid()
     AND s.driver_progress_step >= 3
  RETURNING * INTO fila;

  IF fila.id IS NULL THEN
    RAISE EXCEPTION
      'Solo el conductor asignado puede declarar el pago de un servicio finalizado (%)', p_service_id;
  END IF;

  RETURN fila;
END;
$$;

-- ============================================
-- 2) Aceptar / rechazar el monto (solo el proveedor)
-- ============================================
CREATE OR REPLACE FUNCTION public.resolver_declaracion_de_pago(
  p_service_id UUID,
  p_aceptar BOOLEAN
)
RETURNS public.service_alerts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fila public.service_alerts;
BEGIN
  UPDATE public.service_alerts s
     SET pago_estado = CASE WHEN p_aceptar THEN 'ACEPTADO' ELSE 'RECHAZADO' END,
         pago_aceptado_at = CASE WHEN p_aceptar THEN now() ELSE NULL END,
         pago_aceptado_por = CASE WHEN p_aceptar THEN auth.uid() ELSE NULL END,
         updated_at = now()
   WHERE s.id = p_service_id
     AND s.provider_id = auth.uid()
     AND s.pago_estado = 'DECLARADO'
  RETURNING * INTO fila;

  IF fila.id IS NULL THEN
    RAISE EXCEPTION
      'No hay un monto declarado pendiente de resolver en el servicio %', p_service_id;
  END IF;

  RETURN fila;
END;
$$;

-- ============================================
-- 3) Confirmar pago recibido (solo quien recibe el dinero)
-- ============================================
CREATE OR REPLACE FUNCTION public.confirmar_pago_recibido(p_service_id UUID)
RETURNS public.service_alerts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fila public.service_alerts;
BEGIN
  UPDATE public.service_alerts s
     SET pago_estado = 'CONFIRMADO',
         pago_confirmado_at = now(),
         pago_confirmado_por = auth.uid(),
         updated_at = now()
   WHERE s.id = p_service_id
     AND s.pago_estado = 'ACEPTADO'
     AND (
       (s.pago_direccion = 'DRIVER_PAYS_PROVIDER' AND s.provider_id = auth.uid())
       OR (s.pago_direccion = 'PROVIDER_PAYS_DRIVER' AND s.assigned_driver_id = auth.uid())
     )
  RETURNING * INTO fila;

  IF fila.id IS NULL THEN
    RAISE EXCEPTION 'Solo quien recibe el dinero puede confirmar el pago del servicio %', p_service_id;
  END IF;

  RETURN fila;
END;
$$;

-- ============================================
-- 4) Datos de pago del conductor (solo el proveedor del servicio, caso B)
-- ============================================
-- El proyecto nunca expone `yape_number` / `bcp_account` / `bcp_cci` de otro
-- usuario (0003 y 0005 los excluyen a propósito). Esta función es la única vía:
-- solo el proveedor de ESE servicio y solo cuando el conductor declaró "Me deben",
-- que es cuando el proveedor necesita saber dónde transferirle.
CREATE OR REPLACE FUNCTION public.datos_de_pago_del_conductor(p_service_id UUID)
RETURNS TABLE (yape TEXT, bcp_account TEXT, bcp_cci TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.service_alerts s
    WHERE s.id = p_service_id
      AND s.provider_id = auth.uid()
      AND s.pago_direccion = 'PROVIDER_PAYS_DRIVER'
      AND s.assigned_driver_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'No puedes ver los datos de pago del conductor de este servicio %', p_service_id;
  END IF;

  RETURN QUERY
    SELECT p.yape_number, p.bcp_account, p.bcp_cci
    FROM public.profiles p
    JOIN public.service_alerts s ON s.assigned_driver_id = p.id
    WHERE s.id = p_service_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.declarar_pago_servicio(UUID, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_declaracion_de_pago(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_pago_recibido(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.datos_de_pago_del_conductor(UUID) TO authenticated;

-- Comprobar después de aplicar:
--   SELECT pago_estado, pago_direccion, pago_monto FROM public.service_alerts LIMIT 5;
--   SELECT proname FROM pg_proc WHERE proname LIKE '%pago%';
