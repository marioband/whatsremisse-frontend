-- ============================================
-- 0019: editar y eliminar mensajes (chat del servicio y chat de grupo)
-- ============================================
-- Reglas fijadas con el usuario:
--   * Solo el AUTOR puede editar o eliminar SUS PROPIOS mensajes.
--   * Editar solo dentro de los primeros 15 minutos (igual que WhatsApp).
--     Eliminar no tiene límite de tiempo.
--   * Al editar SOLO se declara que el mensaje fue editado: lo que decía antes
--     no se guarda en ninguna parte (no hay historial de versiones).
--   * Eliminar es un borrado real de la fila: en la conversación queda
--     únicamente el aviso del sistema.
--   * La app declara la acción con un mensaje de sistema
--     ("Sistema: <nombre> editó un mensaje." / "Sistema: <nombre> eliminó un
--     mensaje."). Los mensajes del sistema NO se pueden editar ni eliminar, así
--     que el registro de lo que pasó queda vivo en la conversación.
--
-- La autoría y la ventana de 15 minutos se comprueban TAMBIÉN aquí: si la app
-- fallara, la política sigue impidiendo editar lo ajeno o un mensaje viejo.
-- El mismo número está en `src/lib/mensajes.ts` (MINUTOS_PARA_EDITAR): si
-- cambia la regla, hay que cambiarlo en los dos sitios.

-- ============================================
-- 1) Marca de edición
-- ============================================
ALTER TABLE public.service_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- La marca la pone la base, no la app: si el contenido cambió, el mensaje queda
-- como editado en ese instante; si el UPDATE no cambió el texto, no se marca
-- nada (evita que alguien declare una edición que no ocurrió).
CREATE OR REPLACE FUNCTION public.marcar_mensaje_editado()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content THEN
    NEW.edited_at := now();
  ELSE
    NEW.edited_at := OLD.edited_at;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS marcar_edicion_service_messages ON public.service_messages;
CREATE TRIGGER marcar_edicion_service_messages
  BEFORE UPDATE ON public.service_messages
  FOR EACH ROW EXECUTE FUNCTION public.marcar_mensaje_editado();

DROP TRIGGER IF EXISTS marcar_edicion_messages ON public.messages;
CREATE TRIGGER marcar_edicion_messages
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.marcar_mensaje_editado();

-- ============================================
-- 2) Chat del servicio: editar y eliminar
-- ============================================
-- Los mensajes del sistema tienen `sender_id IS NULL`, así que nunca pasan la
-- condición del autor; el `type <> 'SYSTEM'` va escrito igual para que la regla
-- se lea sola.
DROP POLICY IF EXISTS "Authors edit own service messages" ON public.service_messages;
CREATE POLICY "Authors edit own service messages"
  ON public.service_messages FOR UPDATE
  USING (
    sender_id = auth.uid()
    AND type <> 'SYSTEM'
    AND created_at > now() - INTERVAL '15 minutes'
    AND (
      public.is_service_provider(service_id)
      OR (driver_id = auth.uid() AND public.is_service_driver(service_id))
    )
  )
  WITH CHECK (
    sender_id = auth.uid()
    AND type <> 'SYSTEM'
    AND (
      public.is_service_provider(service_id)
      OR (driver_id = auth.uid() AND public.is_service_driver(service_id))
    )
  );

DROP POLICY IF EXISTS "Authors delete own service messages" ON public.service_messages;
CREATE POLICY "Authors delete own service messages"
  ON public.service_messages FOR DELETE
  USING (
    sender_id = auth.uid()
    AND type <> 'SYSTEM'
    AND (
      public.is_service_provider(service_id)
      OR (driver_id = auth.uid() AND public.is_service_driver(service_id))
    )
  );

-- ============================================
-- 3) Chat de grupo: editar y eliminar
-- ============================================
-- `public.is_group_member` es SECURITY DEFINER (0004), así que esta política no
-- vuelve a aplicar la RLS de `group_members` ni entra en recursión.
DROP POLICY IF EXISTS "Authors edit own group messages" ON public.messages;
CREATE POLICY "Authors edit own group messages"
  ON public.messages FOR UPDATE
  USING (
    sender_id = auth.uid()
    AND type <> 'SYSTEM'
    AND created_at > now() - INTERVAL '15 minutes'
    AND public.is_group_member(group_id, auth.uid())
  )
  WITH CHECK (
    sender_id = auth.uid()
    AND type <> 'SYSTEM'
    AND public.is_group_member(group_id, auth.uid())
  );

DROP POLICY IF EXISTS "Authors delete own group messages" ON public.messages;
CREATE POLICY "Authors delete own group messages"
  ON public.messages FOR DELETE
  USING (
    sender_id = auth.uid()
    AND type <> 'SYSTEM'
    AND public.is_group_member(group_id, auth.uid())
  );

-- Las dos tablas ya están en la publicación `supabase_realtime` (0010), así que
-- los UPDATE llegan solos al otro dispositivo; los DELETE los recoge el sondeo
-- de la app (cada 6 s) y la relectura de la conversación.

NOTIFY pgrst, 'reload schema';

-- ============================================
-- Comprobaciones rápidas (SQL Editor corre como postgres: no aplica RLS)
-- ============================================
--   SELECT id, sender_id, content, edited_at FROM public.service_messages ORDER BY created_at DESC LIMIT 5;
--   SELECT id, sender_id, content, edited_at FROM public.messages ORDER BY created_at DESC LIMIT 5;
--   SELECT policyname, cmd FROM pg_policies
--     WHERE tablename IN ('service_messages', 'messages') ORDER BY tablename, cmd;
