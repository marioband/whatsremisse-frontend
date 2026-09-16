-- ============================================
-- 0018: una alerta de servicio compartida a VARIOS grupos (sin duplicados)
-- ============================================
-- Síntoma (usuario): lanzó una alerta a dos grupos y al conductor que está en los
-- dos le llegaron DOS alertas iguales.
--
-- Causa: el modelo era "una tarjeta = un grupo" (`service_alerts.group_id` es un
-- solo UUID), así que la app creaba una fila por grupo. Consecuencias: dos tarjetas
-- idénticas en el conductor y en la lista del proveedor, dos avisos, dos juegos de
-- postulantes, dos chats y dos cuadres; y al aceptar a un conductor en una, la otra
-- quedaba abierta como un viaje aparte que cualquiera podía tomar.
--
-- Ahora la alerta es UNA y se comparte a N grupos con `service_alert_groups`.
-- `service_alerts.group_id` se conserva como GRUPO PRINCIPAL (el primero elegido)
-- para no romper lo que ya lo lee: la franja "Servicio no compartido", la ruta de
-- edición del proveedor y la visibilidad del conductor cuando la lista completa no
-- está cargada. La verdad de a qué grupos está compartida vive aquí.
--
-- Escritura: solo por `compartir_servicio_con_grupos` (SECURITY DEFINER, valida que
-- quien comparte sea el proveedor y que los grupos sean suyos). No se abre la tabla
-- a escritura directa.

CREATE TABLE IF NOT EXISTS public.service_alert_groups (
  service_id UUID NOT NULL REFERENCES public.service_alerts(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  -- Orden en que el proveedor los eligió: el primero es el grupo principal.
  posicion SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (service_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_service_alert_groups_group
  ON public.service_alert_groups(group_id);

ALTER TABLE public.service_alert_groups ENABLE ROW LEVEL SECURITY;

-- Solo lectura: las escrituras pasan por la función de abajo (que es la que valida
-- quién comparte y con qué grupos).
GRANT SELECT ON public.service_alert_groups TO authenticated;

-- Lectura: los integrantes del grupo (para que el conductor sepa que la alerta es
-- para él) y el proveedor del servicio (para la pantalla de grupos).
DROP POLICY IF EXISTS "Members read service shares" ON public.service_alert_groups;
CREATE POLICY "Members read service shares"
  ON public.service_alert_groups
  FOR SELECT
  USING (
    public.is_group_member(group_id, auth.uid())
    OR public.is_service_provider(service_id)
  );

-- ============================================
-- Compartir (o dejar de compartir) una alerta con un conjunto de grupos
-- ============================================
-- Reemplaza el conjunto completo: devolver el mismo array es idempotente y un array
-- vacío deja la tarjeta sin compartir (group_id queda NULL, que es lo que lee la
-- franja "Servicio no compartido").
CREATE OR REPLACE FUNCTION public.compartir_servicio_con_grupos(
  p_service_id UUID,
  p_group_ids UUID[]
)
RETURNS SETOF public.service_alert_groups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  grupos UUID[] := coalesce(p_group_ids, '{}'::UUID[]);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.service_alerts s
    WHERE s.id = p_service_id AND s.provider_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Solo el proveedor puede compartir su servicio %', p_service_id;
  END IF;

  -- Los grupos tienen que ser suyos: sin esto, cualquiera con la función a mano
  -- podría repartir un servicio a grupos ajenos (y hacérselo ver a sus integrantes).
  IF EXISTS (
    SELECT 1
    FROM unnest(grupos) AS g(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = g.id AND gm.user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'No puedes compartir el servicio con un grupo del que no eres integrante (%)', p_service_id;
  END IF;

  DELETE FROM public.service_alert_groups sag
   WHERE sag.service_id = p_service_id
     AND NOT (sag.group_id = ANY (grupos));

  INSERT INTO public.service_alert_groups (service_id, group_id, posicion)
  SELECT p_service_id, g.id, g.pos::SMALLINT
    FROM unnest(grupos) WITH ORDINALITY AS g(id, pos)
  ON CONFLICT (service_id, group_id) DO UPDATE SET posicion = EXCLUDED.posicion;

  -- Grupo principal = el primero elegido. Al cambiar de público se reabre la
  -- pregunta de quién puede tomarlo; el trigger de la 0016 se encarga de descartar
  -- las postulaciones que ya no correspondan si el grupo principal cambia.
  UPDATE public.service_alerts s
     SET group_id = (
       SELECT sag.group_id
         FROM public.service_alert_groups sag
        WHERE sag.service_id = p_service_id
        ORDER BY sag.posicion, sag.group_id
        LIMIT 1
     )
   WHERE s.id = p_service_id;

  RETURN QUERY
    SELECT * FROM public.service_alert_groups sag
     WHERE sag.service_id = p_service_id
     ORDER BY sag.posicion, sag.group_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compartir_servicio_con_grupos(UUID, UUID[]) TO authenticated;

-- Comprobar después de aplicar: una tarjeta compartida a dos grupos debe tener DOS
-- filas aquí y UNA en service_alerts:
--   SELECT service_id, group_id, posicion FROM public.service_alert_groups
--    ORDER BY created_at DESC LIMIT 5;
--   SELECT id, group_id FROM public.service_alerts ORDER BY created_at DESC LIMIT 5;
