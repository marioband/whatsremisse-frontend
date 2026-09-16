-- ============================================
-- 0012: el conductor asignado puede reportar su proceso (RLS lo impedía)
-- ============================================
-- Síntoma del usuario: "los procesos de los servicios no terminan, se quedan en
-- bucles y vuelven a aparecer al actualizar la app; el reporte del conductor
-- sobre su proceso no se refleja en la tarjeta del proveedor".
--
-- Causa: en `service_alerts` la única política de escritura es
--   "Providers manage own services"  (auth.uid() = provider_id)
-- así que el UPDATE que hace el conductor (driver_progress_step, status,
-- settlement_enabled, commission_paid, driver_payment_received) **no toca
-- ninguna fila**: PostgREST responde 204, el cliente cree que guardó y el avance
-- solo se ve en el teléfono del conductor... hasta que recarga la app, cuando
-- vuelve al estado real de la base. El proveedor, por lo mismo, nunca ve nada.
--
-- Se arregla con funciones SECURITY DEFINER que permiten SOLO esos campos y solo
-- al conductor asignado (no se abre la tabla completa a escritura).
-- Mismo patrón que 0004/0005/0006 con `group_members`.

-- ============================================
-- Reporte del avance: Ubicado(1) -> En proceso(2) -> Finalizado(3)
-- ============================================
CREATE OR REPLACE FUNCTION public.reportar_progreso_servicio(p_service_id UUID, p_paso SMALLINT)
RETURNS public.service_alerts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fila public.service_alerts;
BEGIN
  IF p_paso IS NULL OR p_paso < 1 OR p_paso > 3 THEN
    RAISE EXCEPTION 'Paso inválido: % (se espera 1..3)', p_paso;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.service_alerts s
    WHERE s.id = p_service_id AND s.assigned_driver_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Solo el conductor asignado puede reportar el proceso del servicio %', p_service_id;
  END IF;

  UPDATE public.service_alerts s
     SET driver_progress_step = p_paso,
         -- El paso 2 es "viaje iniciado" y el 3 cierra el servicio y abre el cuadre.
         status = CASE
                    WHEN p_paso = 2 THEN 'STATUS_IN_PROGRESS'
                    WHEN p_paso >= 3 THEN 'STATUS_COMPLETED'
                    ELSE s.status
                  END,
         settlement_enabled = CASE WHEN p_paso >= 3 THEN true ELSE s.settlement_enabled END,
         completed_at = CASE WHEN p_paso >= 3 THEN now() ELSE s.completed_at END,
         updated_at = now()
   WHERE s.id = p_service_id
     AND s.assigned_driver_id = auth.uid()
     AND s.driver_progress_step <= p_paso  -- nunca hacia atrás (evita el bucle)
  RETURNING * INTO fila;

  -- Si ya estaba en ese paso o más adelante, se devuelve la fila tal cual.
  IF fila.id IS NULL THEN
    SELECT * INTO fila FROM public.service_alerts WHERE id = p_service_id;
  END IF;

  RETURN fila;
END;
$$;

-- ============================================
-- Cuadre: comisión entregada / pago recibido (los marca el conductor)
-- ============================================
CREATE OR REPLACE FUNCTION public.marcar_hito_de_pago(p_service_id UUID, p_hito TEXT)
RETURNS public.service_alerts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fila public.service_alerts;
BEGIN
  IF p_hito NOT IN ('comision', 'pago') THEN
    RAISE EXCEPTION 'Hito inválido: % (se espera comision o pago)', p_hito;
  END IF;

  UPDATE public.service_alerts s
     SET commission_paid = CASE WHEN p_hito = 'comision' THEN true ELSE s.commission_paid END,
         driver_payment_received =
           CASE WHEN p_hito = 'pago' THEN true ELSE s.driver_payment_received END,
         updated_at = now()
   WHERE s.id = p_service_id AND s.assigned_driver_id = auth.uid()
  RETURNING * INTO fila;

  IF fila.id IS NULL THEN
    RAISE EXCEPTION 'Solo el conductor asignado puede marcar el cuadre del servicio %', p_service_id;
  END IF;

  RETURN fila;
END;
$$;

-- ============================================
-- Archivado por usuario
-- ============================================
-- `service_alerts.archived` es una sola bandera por servicio: si un conductor la
-- escribiera, archivaría el servicio también para el proveedor. El conductor
-- archiva PARA SÍ MISMO en su propia tabla (RLS: solo sus filas).

CREATE TABLE IF NOT EXISTS public.service_archives (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.service_alerts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_service_archives_user ON public.service_archives(user_id);

ALTER TABLE public.service_archives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own service archives" ON public.service_archives;
CREATE POLICY "Own service archives"
  ON public.service_archives
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.archivar_servicio(p_service_id UUID, p_archivado BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  soy_proveedor BOOLEAN;
  participo BOOLEAN;
BEGIN
  SELECT (s.provider_id = auth.uid()) INTO soy_proveedor
    FROM public.service_alerts s WHERE s.id = p_service_id;

  IF soy_proveedor IS NULL THEN
    RAISE EXCEPTION 'Servicio inexistente: %', p_service_id;
  END IF;

  IF soy_proveedor THEN
    UPDATE public.service_alerts SET archived = p_archivado, updated_at = now()
      WHERE id = p_service_id;
    RETURN true;
  END IF;

  SELECT EXISTS (
           SELECT 1 FROM public.service_alerts s
           WHERE s.id = p_service_id AND s.assigned_driver_id = auth.uid()
         )
      OR EXISTS (
           SELECT 1 FROM public.applications a
           WHERE a.service_id = p_service_id AND a.driver_id = auth.uid()
         )
    INTO participo;

  IF NOT participo THEN
    RAISE EXCEPTION 'No participas en el servicio %', p_service_id;
  END IF;

  IF p_archivado THEN
    INSERT INTO public.service_archives(user_id, service_id)
    VALUES (auth.uid(), p_service_id)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.service_archives
    WHERE user_id = auth.uid() AND service_id = p_service_id;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reportar_progreso_servicio(UUID, SMALLINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_hito_de_pago(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archivar_servicio(UUID, BOOLEAN) TO authenticated;
