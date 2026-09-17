-- ============================================
-- 0020: confirmación de lectura (palomitas) en los dos chats
-- ============================================
-- Reglas fijadas con el usuario:
--   * Palomita tenue = el mensaje se envió (ya está en la base).
--   * Doble palomita blanca = TODOS los demás participantes lo leyeron.
--   * Relojito mientras el mensaje todavía no está guardado.
--   * Se marca leído al abrir el chat, automáticamente (como WhatsApp).
--
-- No se guarda una fila por mensaje y por lector (en un grupo de 20 serían miles
-- de filas): se guarda HASTA CUÁNDO leyó cada participante en esa conversación
-- (`last_read_at`), y un mensaje está leído por alguien si su `last_read_at` es
-- posterior a `created_at` del mensaje. Es el mismo modelo que usa WhatsApp para
-- las palomitas.
--
-- La marca la pone la BASE (`now()` en las funciones de abajo), nunca el teléfono:
-- con relojes desfasados una palomita mentiría.

-- ============================================
-- 1) Tablas
-- ============================================
-- Chat 1 a 1 del servicio: la conversación es (servicio, conductor) y en ella
-- participan ese conductor y el proveedor del servicio.
CREATE TABLE IF NOT EXISTS public.service_chat_reads (
  service_id uuid NOT NULL REFERENCES public.service_alerts(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (service_id, driver_id, user_id)
);

-- Chat de grupo: cada integrante tiene su propia marca en ese grupo.
CREATE TABLE IF NOT EXISTS public.group_chat_reads (
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_service_chat_reads_conversacion
  ON public.service_chat_reads(service_id, driver_id);
CREATE INDEX IF NOT EXISTS idx_group_chat_reads_group ON public.group_chat_reads(group_id);

ALTER TABLE public.service_chat_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_chat_reads ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2) Políticas
-- ============================================
-- El remitente necesita leer la marca del OTRO para pintar la doble palomita, así
-- que los participantes se leen entre ellos; cada quien solo escribe SU fila.
DROP POLICY IF EXISTS "Participants read service chat reads" ON public.service_chat_reads;
CREATE POLICY "Participants read service chat reads"
  ON public.service_chat_reads FOR SELECT
  USING (
    public.is_service_provider(service_id)
    OR (driver_id = auth.uid() AND public.is_service_driver(service_id))
  );

DROP POLICY IF EXISTS "Own service chat read" ON public.service_chat_reads;
CREATE POLICY "Own service chat read"
  ON public.service_chat_reads FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      public.is_service_provider(service_id)
      OR (driver_id = auth.uid() AND public.is_service_driver(service_id))
    )
  );

DROP POLICY IF EXISTS "Own service chat read update" ON public.service_chat_reads;
CREATE POLICY "Own service chat read update"
  ON public.service_chat_reads FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Members read group chat reads" ON public.group_chat_reads;
CREATE POLICY "Members read group chat reads"
  ON public.group_chat_reads FOR SELECT
  USING (public.is_group_member(group_id, auth.uid()));

DROP POLICY IF EXISTS "Own group chat read" ON public.group_chat_reads;
CREATE POLICY "Own group chat read"
  ON public.group_chat_reads FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.is_group_member(group_id, auth.uid()));

DROP POLICY IF EXISTS "Own group chat read update" ON public.group_chat_reads;
CREATE POLICY "Own group chat read update"
  ON public.group_chat_reads FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.service_chat_reads TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.group_chat_reads TO authenticated;

-- ============================================
-- 3) Funciones para marcar la lectura (la hora la pone la base)
-- ============================================
-- Son SECURITY INVOKER a propósito: la RLS de arriba sigue siendo la que decide
-- quién puede escribir. Si alguien que no participa en la conversación llama, el
-- INSERT no pasa la política y la app lo trata como "no se pudo marcar".
CREATE OR REPLACE FUNCTION public.marcar_lectura_del_servicio(
  p_service_id uuid,
  p_driver_id uuid
)
RETURNS timestamptz
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ahora timestamptz := now();
BEGIN
  INSERT INTO public.service_chat_reads (service_id, driver_id, user_id, last_read_at)
  VALUES (p_service_id, p_driver_id, auth.uid(), v_ahora)
  ON CONFLICT (service_id, driver_id, user_id)
  DO UPDATE SET last_read_at = GREATEST(public.service_chat_reads.last_read_at, EXCLUDED.last_read_at);
  RETURN v_ahora;
END $$;

CREATE OR REPLACE FUNCTION public.marcar_lectura_del_grupo(p_group_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ahora timestamptz := now();
BEGIN
  INSERT INTO public.group_chat_reads (group_id, user_id, last_read_at)
  VALUES (p_group_id, auth.uid(), v_ahora)
  ON CONFLICT (group_id, user_id)
  DO UPDATE SET last_read_at = GREATEST(public.group_chat_reads.last_read_at, EXCLUDED.last_read_at);
  RETURN v_ahora;
END $$;

REVOKE ALL ON FUNCTION public.marcar_lectura_del_servicio(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.marcar_lectura_del_grupo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marcar_lectura_del_servicio(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_lectura_del_grupo(uuid) TO authenticated;

-- ============================================
-- 4) Tiempo real
-- ============================================
-- Sin esto, el remitente vería la doble palomita solo con el sondeo (cada 6 s).
DO $$
DECLARE
  tabla text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime FOR TABLE
      public.service_chat_reads, public.group_chat_reads;
    RETURN;
  END IF;

  FOREACH tabla IN ARRAY ARRAY[
    'public.service_chat_reads',
    'public.group_chat_reads'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %s', tabla);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================
-- Comprobaciones rápidas (SQL Editor corre como postgres: no aplica RLS)
-- ============================================
--   SELECT * FROM public.service_chat_reads ORDER BY last_read_at DESC LIMIT 5;
--   SELECT * FROM public.group_chat_reads ORDER BY last_read_at DESC LIMIT 5;
--   SELECT policyname, cmd FROM pg_policies
--     WHERE tablename IN ('service_chat_reads', 'group_chat_reads') ORDER BY tablename, cmd;
