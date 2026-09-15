-- ============================================
-- 0010: chat 1 a 1 del servicio (conductor <-> proveedor)
-- ============================================
-- Antes este chat vivía SOLO en la memoria del dispositivo: `addMessage` no
-- escribía en la base y la tabla `messages` es de grupos (`group_id NOT NULL`),
-- así que el conductor y el proveedor nunca se veían los mensajes.
--
-- Aquí va la conversación por (servicio, conductor): el proveedor puede tener
-- una conversación con cada postulante/ conductor asignado del mismo servicio.

CREATE TABLE IF NOT EXISTS public.service_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES public.service_alerts(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- NULL = mensaje del sistema (los hitos del viaje los genera la app)
  sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'TEXT' CHECK (
    type IN ('TEXT', 'SYSTEM', 'VOICE', 'PHOTO', 'LOCATION', 'CONTACT')
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_messages_service ON public.service_messages(service_id);
CREATE INDEX IF NOT EXISTS idx_service_messages_conversation
  ON public.service_messages(service_id, driver_id);
CREATE INDEX IF NOT EXISTS idx_service_messages_created_at ON public.service_messages(created_at);

ALTER TABLE public.service_messages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Funciones auxiliares SECURITY DEFINER
-- ============================================
-- Igual que en 0004/0005/0006: dentro de una función SECURITY DEFINER no se
-- aplica RLS, así que comprobar `service_alerts`/`applications` desde una
-- política de `service_messages` no provoca recursión ni depende de que el
-- usuario pueda leer esas filas.

CREATE OR REPLACE FUNCTION public.is_service_provider(p_service_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.service_alerts s
    WHERE s.id = p_service_id AND s.provider_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_service_driver(p_service_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.service_alerts s
    WHERE s.id = p_service_id AND s.assigned_driver_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.applications a
    WHERE a.service_id = p_service_id AND a.driver_id = auth.uid()
  );
$$;

-- ============================================
-- Políticas
-- ============================================
-- El proveedor del servicio lee TODAS las conversaciones de su servicio; cada
-- conductor lee solo la suya. `sender_id IS NULL` (sistema) lo puede escribir
-- cualquiera de los dos participantes.

DROP POLICY IF EXISTS "Participants read service messages" ON public.service_messages;
CREATE POLICY "Participants read service messages"
  ON public.service_messages
  FOR SELECT
  USING (
    public.is_service_provider(service_id)
    OR (driver_id = auth.uid() AND public.is_service_driver(service_id))
  );

DROP POLICY IF EXISTS "Participants send service messages" ON public.service_messages;
CREATE POLICY "Participants send service messages"
  ON public.service_messages
  FOR INSERT
  WITH CHECK (
    (
      public.is_service_provider(service_id)
      OR (driver_id = auth.uid() AND public.is_service_driver(service_id))
    )
    AND (sender_id IS NULL OR sender_id = auth.uid())
  );

-- ============================================
-- Tiempo real
-- ============================================
-- Sin añadir la tabla a la publicación, `postgres_changes` no emite nada: los
-- mensajes llegarían solo al recargar. Se incluyen también las tablas que ya
-- usa la app en tiempo real (servicios, postulaciones y mensajes de grupo).
-- Si el proyecto no tuviera la publicación `supabase_realtime`, se crea.

DO $$
DECLARE
  tabla text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime FOR TABLE
      public.service_messages, public.messages, public.service_alerts, public.applications;
    RETURN;
  END IF;

  FOREACH tabla IN ARRAY ARRAY[
    'public.service_messages',
    'public.messages',
    'public.service_alerts',
    'public.applications'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %s', tabla);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;
