-- ============================================
-- 0016: editar el servicio descarta las postulaciones de la ronda anterior
-- ============================================
-- Regla fijada con el usuario: "si el proveedor edita, reenvía o cambia cualquier
-- cosa del servicio, se descartan las postulaciones viejas para que la cola
-- empiece desde cero".
--
-- Por qué va en la base y no en la app: el `service_id` se REUTILIZA cuando el
-- proveedor edita la tarjeta o la vuelve a compartir ("Elegir grupos" aplica el
-- grupo a la tarjeta existente) y ninguna de esas rutas tocaba `applications`.
-- Resultado: el conductor seguía viendo su tarjeta azul con su número viejo en una
-- alerta que él considera nueva, y el proveedor seguía viendo postulantes de la
-- ronda anterior. En un trigger vale para cualquier cliente (la app, Studio, un
-- UPDATE suelto) y no depende de que nadie se acuerde de limpiar.
--
-- "Cambiar el servicio" (lo que dispara la limpieza): título, descripción, origen
-- y destino (dirección y coordenadas), requisitos del vehículo, tarifa, hora
-- programada, grupo al que se comparte y los datos de pago del proveedor de esa
-- tarjeta.
--
-- Lo que NO la dispara, a propósito (es el estado del viaje, no una edición):
-- status, assigned_driver_id, driver_progress_step, archived, commission_paid,
-- driver_payment_received, settlement_enabled, pago_* y updated_at. Si algún día
-- se quiere que archivar/desarchivar también limpie la cola, basta añadir
-- `OLD.archived IS DISTINCT FROM NEW.archived` a la lista del trigger.
--
-- Guardar sin cambiar nada NO limpia la cola: la comparación es por columna con
-- IS DISTINCT FROM, así que un guardado accidental no borra a los postulantes de
-- la ronda en curso.

CREATE OR REPLACE FUNCTION public.limpiar_postulaciones_al_editar_servicio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_descartadas INTEGER;
BEGIN
  -- Se marcan como REJECTED (no se borran): conservan su histórico y el upsert de
  -- la app puede reactivarlas si el conductor vuelve a postular; el puesto lo
  -- vuelve a calcular el trigger de la 0015, que solo cuenta las PENDING.
  UPDATE public.applications
     SET status = 'REJECTED'
   WHERE service_id = NEW.id
     AND status = 'PENDING';

  GET DIAGNOSTICS v_descartadas = ROW_COUNT;

  IF v_descartadas > 0 THEN
    RAISE NOTICE 'Servicio % editado: % postulaciones descartadas, la cola empieza de cero',
      NEW.id, v_descartadas;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.limpiar_postulaciones_al_editar_servicio() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.limpiar_postulaciones_al_editar_servicio() TO authenticated;

DROP TRIGGER IF EXISTS limpiar_postulaciones_al_editar ON public.service_alerts;
CREATE TRIGGER limpiar_postulaciones_al_editar
  AFTER UPDATE ON public.service_alerts
  FOR EACH ROW
  WHEN (
       OLD.title IS DISTINCT FROM NEW.title
    OR OLD.description IS DISTINCT FROM NEW.description
    OR OLD.origin_address IS DISTINCT FROM NEW.origin_address
    OR OLD.origin_lat IS DISTINCT FROM NEW.origin_lat
    OR OLD.origin_lng IS DISTINCT FROM NEW.origin_lng
    OR OLD.destination_address IS DISTINCT FROM NEW.destination_address
    OR OLD.destination_lat IS DISTINCT FROM NEW.destination_lat
    OR OLD.destination_lng IS DISTINCT FROM NEW.destination_lng
    OR OLD.vehicle_requirements IS DISTINCT FROM NEW.vehicle_requirements
    OR OLD.fare IS DISTINCT FROM NEW.fare
    OR OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at
    OR OLD.group_id IS DISTINCT FROM NEW.group_id
    OR OLD.provider_yape IS DISTINCT FROM NEW.provider_yape
    OR OLD.provider_bcp_account IS DISTINCT FROM NEW.provider_bcp_account
    OR OLD.provider_bcp_cci IS DISTINCT FROM NEW.provider_bcp_cci
  )
  EXECUTE FUNCTION public.limpiar_postulaciones_al_editar_servicio();

-- Comprobar el resultado:
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.service_alerts'::regclass
--     AND NOT tgisinternal;
--   -- Tras editar una tarjeta con postulantes no debe quedar ninguna PENDING:
--   SELECT service_id, "order", status FROM public.applications
--    WHERE status = 'PENDING' ORDER BY service_id, "order";
