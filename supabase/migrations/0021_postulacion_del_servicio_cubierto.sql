-- ============================================
-- 0021: un servicio ya cubierto no admite postulaciones nuevas, y la aceptación no se
--       puede deshacer por accidente
-- ============================================
-- Reglas fijadas con el usuario tras el fallo del 17-09-2026 (conductor 999888777):
--   * Si un servicio YA tiene conductor asignado, la fila de ESE conductor vale
--     APPROVED, diga lo que diga el cliente. Su teléfono puede no haberse enterado de
--     la aceptación y volver a postularse —el upsert de la app escribe PENDING— y eso
--     dejaba al conductor aceptado con la tarjeta de "postulando" y sin poder abrir el
--     chat del viaje que ya estaba cubriendo.
--   * La postulación de cualquier OTRO conductor a un servicio ya cubierto no se queda
--     PENDING (ya no hay cola que hacer): pasa a REJECTED, que es lo que la app muestra
--     como "rechazado o cubierto por otro conductor".
--
-- Va en la BASE y no solo en la app porque la fila la puede escribir cualquier cliente:
-- la política "Drivers manage own applications" (0001) deja al conductor tocar SUS
-- propias filas, así que la regla tiene que valer también para un UPDATE suelto, para
-- una versión vieja de la app o para una prueba hecha a mano en Studio.
--
-- Lo que NO cambia: postularse a un servicio libre sigue igual (PENDING), y el flujo de
-- aceptar del proveedor (APPROVED al elegido, REJECTED a los demás y luego asignar el
-- servicio) sigue funcionando: cuando la base escribe esas filas el servicio todavía no
-- tiene conductor, así que el trigger no interviene.

-- ============================================
-- 1) Reparación de las filas que quedaron mal
-- ============================================
-- El conductor aceptado con la fila en PENDING (o REJECTED) vuelve a APPROVED: si el
-- servicio está asignado a él, su postulación está aceptada por definición.
UPDATE public.applications a
   SET status = 'APPROVED'
  FROM public.service_alerts s
 WHERE s.id = a.service_id
   AND s.assigned_driver_id = a.driver_id
   AND a.status <> 'APPROVED';

-- Y las postulaciones que quedaron esperando en un servicio ya cubierto por otro pasan
-- a REJECTED (no hay nada que esperar).
UPDATE public.applications a
   SET status = 'REJECTED'
  FROM public.service_alerts s
 WHERE s.id = a.service_id
   AND s.assigned_driver_id IS NOT NULL
   AND s.assigned_driver_id <> a.driver_id
   AND a.status = 'PENDING';

-- ============================================
-- 2) La regla, para lo que venga después
-- ============================================
CREATE OR REPLACE FUNCTION public.mantener_postulacion_del_asignado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asignado uuid;
BEGIN
  SELECT s.assigned_driver_id INTO v_asignado
    FROM public.service_alerts s
   WHERE s.id = NEW.service_id;

  IF v_asignado IS NULL THEN
    RETURN NEW;            -- servicio libre: la postulación manda
  END IF;

  IF v_asignado = NEW.driver_id THEN
    NEW.status := 'APPROVED';   -- el servicio es suyo: está aceptado, diga lo que diga
  ELSIF NEW.status = 'PENDING' THEN
    NEW.status := 'REJECTED';   -- ya está cubierto por otro: no hay cola
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.mantener_postulacion_del_asignado() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mantener_postulacion_del_asignado() TO authenticated;

DROP TRIGGER IF EXISTS mantener_postulacion_del_asignado ON public.applications;
CREATE TRIGGER mantener_postulacion_del_asignado
  BEFORE INSERT OR UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.mantener_postulacion_del_asignado();

-- ============================================
-- 3) Y al revés: cuando un servicio se ASIGNA, las postulaciones se alinean
-- ============================================
-- El caso reportado llegó así: el servicio quedó asignado al conductor y su fila se
-- quedó en PENDING (su teléfono se volvió a postular después). Con este trigger la
-- coherencia se mantiene sin depender del orden en que el cliente escriba las filas:
-- al asignar, el conductor elegido queda APPROVED y los demás PENDING pasan a REJECTED.
CREATE OR REPLACE FUNCTION public.alinear_postulaciones_al_asignar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_driver_id IS NULL THEN
    RETURN NULL;   -- desasignar no toca las postulaciones (el proveedor decide)
  END IF;

  UPDATE public.applications
     SET status = 'APPROVED'
   WHERE service_id = NEW.id
     AND driver_id = NEW.assigned_driver_id
     AND status <> 'APPROVED';

  UPDATE public.applications
     SET status = 'REJECTED'
   WHERE service_id = NEW.id
     AND driver_id <> NEW.assigned_driver_id
     AND status = 'PENDING';

  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.alinear_postulaciones_al_asignar() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.alinear_postulaciones_al_asignar() TO authenticated;

DROP TRIGGER IF EXISTS alinear_postulaciones_al_asignar ON public.service_alerts;
CREATE TRIGGER alinear_postulaciones_al_asignar
  AFTER UPDATE ON public.service_alerts
  FOR EACH ROW
  WHEN (OLD.assigned_driver_id IS DISTINCT FROM NEW.assigned_driver_id)
  EXECUTE FUNCTION public.alinear_postulaciones_al_asignar();

NOTIFY pgrst, 'reload schema';

-- ============================================
-- Comprobaciones rápidas (SQL Editor corre como postgres: no aplica RLS)
-- ============================================
--   -- 1) ¿quedó alguna fila en desacuerdo con el servicio asignado?
--   SELECT a.service_id, a.driver_id, a.status, s.assigned_driver_id
--     FROM public.applications a JOIN public.service_alerts s ON s.id = a.service_id
--    WHERE s.assigned_driver_id IS NOT NULL
--      AND a.status <> CASE WHEN s.assigned_driver_id = a.driver_id THEN 'APPROVED' ELSE a.status END;
--   -- 2) ¿está el trigger?
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.applications'::regclass AND NOT tgisinternal;
