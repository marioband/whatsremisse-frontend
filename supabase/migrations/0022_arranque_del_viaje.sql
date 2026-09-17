-- ============================================
-- 0022: el toque "Servicio aceptado, toca para iniciar" llega a la base
-- ============================================
-- Reestructuración de los apartados pedida por el usuario (17-09-2026): la tarjeta pasa
-- de "Disponibles" (conductor) / "Publicados" (proveedor) a **"En proceso"** cuando el
-- conductor hace el toque "Servicio aceptado, toca para iniciar".
--
-- Hasta ahora ese toque era una marca LOCAL del teléfono del conductor
-- (`lib/inicioDelViaje.ts`): el proveedor no podía verlo, así que su tarjeta se movía en
-- otro momento y los dos teléfonos no contaban lo mismo. Esta migración guarda el toque
-- el la fila del servicio.
--
-- Lo que NO hace: no toca `driver_progress_step` ni el estado. El toque NO es un hito
-- (regla del usuario): el primer hito ("Ubicado") lo reporta el conductor al deslizar la
-- barra dentro del chat, ya en el origen.
--
-- La marca es del (servicio, conductor) que la puso: si el proveedor cambia de conductor
-- (o lo deja sin conductor), la marca se borra sola.

ALTER TABLE public.service_alerts
  ADD COLUMN IF NOT EXISTS driver_started_at timestamptz;

-- ============================================
-- 1) El conductor asignado marca su arranque
-- ============================================
-- El conductor no puede escribir `service_alerts` (RLS: solo el proveedor), así que va
-- con una función SECURITY DEFINER, igual que el reporte de avance de la 0012.
CREATE OR REPLACE FUNCTION public.iniciar_viaje_del_servicio(p_service_id UUID)
RETURNS public.service_alerts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fila public.service_alerts;
BEGIN
  UPDATE public.service_alerts s
     SET driver_started_at = COALESCE(s.driver_started_at, now()),
         updated_at = now()
   WHERE s.id = p_service_id
     AND s.assigned_driver_id = auth.uid()
  RETURNING * INTO fila;

  IF fila.id IS NULL THEN
    RAISE EXCEPTION 'Solo el conductor asignado puede iniciar el servicio %', p_service_id;
  END IF;

  RETURN fila;
END;
$$;

REVOKE ALL ON FUNCTION public.iniciar_viaje_del_servicio(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iniciar_viaje_del_servicio(uuid) TO authenticated;

-- ============================================
-- 2) La marca es del conductor que la puso
-- ============================================
-- Si el proveedor reasigna el servicio (otro conductor, o sin conductor), el arranque del
-- anterior no puede quedar pegado: la tarjeta nueva tiene que volver a esperar su toque.
CREATE OR REPLACE FUNCTION public.reiniciar_arranque_al_cambiar_conductor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_driver_id IS DISTINCT FROM OLD.assigned_driver_id THEN
    NEW.driver_started_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.reiniciar_arranque_al_cambiar_conductor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reiniciar_arranque_al_cambiar_conductor() TO authenticated;

DROP TRIGGER IF EXISTS reiniciar_arranque_al_cambiar_conductor ON public.service_alerts;
CREATE TRIGGER reiniciar_arranque_al_cambiar_conductor
  BEFORE UPDATE ON public.service_alerts
  FOR EACH ROW EXECUTE FUNCTION public.reiniciar_arranque_al_cambiar_conductor();

-- ============================================
-- 3) Lo que ya estaba en curso cuenta como arrancado
-- ============================================
-- Los servicios con un hito reportado (paso >= 1) ya están trabajándose —y el proveedor
-- los veía en "En proceso"—, así que se les deja la marca puesta: sin esto, el día de la
-- migración los viajes en curso volverían un momento a "Publicados".
UPDATE public.service_alerts
   SET driver_started_at = COALESCE(completed_at, updated_at, now())
 WHERE driver_progress_step >= 1
   AND driver_started_at IS NULL;

NOTIFY pgrst, 'reload schema';

-- ============================================
-- Comprobaciones rápidas (SQL Editor corre como postgres: no aplica RLS)
-- ============================================
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_name = 'service_alerts' AND column_name = 'driver_started_at';
--   SELECT id, assigned_driver_id, driver_progress_step, status, driver_started_at
--     FROM public.service_alerts ORDER BY created_at DESC LIMIT 5;
