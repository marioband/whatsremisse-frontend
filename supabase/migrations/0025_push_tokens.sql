-- ============================================
-- 0025: avisos con la app CERRADA (token de Expo Push)
-- ============================================
-- Qué arregla (18-09-2026, pedido del usuario): los avisos que hoy da la app son
-- notificaciones LOCALES: suenan en el teléfono que hace la acción y solo si la app está
-- abierta. Al conductor no le llegaba nada de lo que hacía el proveedor (una tarjeta
-- nueva, un mensaje, una postulación aceptada) ni al proveedor lo del conductor (una
-- postulación, un mensaje, un hito del viaje) cuando tenía la app cerrada.
--
-- Con esta migración la BASE avisa por su cuenta: cada fila que entra en `service_messages`,
-- `messages`, `service_alerts` o `applications` busca los tokens de Expo Push de los
-- implicados (los DEL OTRO LADO, nunca el que provoca el cambio) y hace un POST a la API de
-- Expo con la lista completa. El texto es el mismo vocabulario que usa la app
-- (`src/lib/avisos.ts`): tarjeta de servicio, hito del viaje, mensaje, postulación.
--
-- Detalles que importan:
--   * El POST va por `pg_net` (`net.http_post`), que es asíncrono: la fila se guarda sin
--     esperar a la red. Si la extensión no está disponible, el envío FALLA pero se avisa
--     con un WARNING y el INSERT se guarda igual: un push caído no puede romper el chat.
--   * Un `enviar_push` sin tokens (nadie con la app instalada o nadie del otro lado) no
--     hace ninguna llamada.
--   * Los tres avisos del hito del viaje los provoca el conductor asignado, así que se
--     excluye de los destinatarios a ese conductor (si no, se avisaría a sí mismo).
--     OJO: los tres textos están copiados de `src/lib/mensajes.ts` → `AVISOS_DEL_HITO`;
--     si cambian allí, hay que cambiarlos aquí.
--
-- Aplicar desde el terminal del VPS con el rol DUEÑO de las tablas (no con `-U postgres`:
-- no es dueño y el CREATE TABLE/TRIGGER falla con "must be owner"). Si `CREATE EXTENSION
-- pg_net` falla, se aplica el resto igual (cada sentencia va sola) y hay que instalarla
-- desde el panel de Supabase (Database → Extensions → pg_net) para que los avisos salgan.

-- ---------------------------------------------------------------------------
-- 1) Los tokens de cada dispositivo
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Token de Expo Push (ExponentPushToken[...]) del dispositivo.
  token TEXT NOT NULL,
  -- 'android', 'ios' o 'web' — informativo: la web no tiene token de Expo.
  plataforma TEXT NOT NULL DEFAULT 'desconocida',
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON public.push_tokens(user_id);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Cada quien administra SOLO sus tokens: los de los demás los lee la base (funciones
-- SECURITY DEFINER de abajo), nunca un cliente.
DROP POLICY IF EXISTS "Cada quien lee sus tokens" ON public.push_tokens;
CREATE POLICY "Cada quien lee sus tokens" ON public.push_tokens
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Cada quien registra su token" ON public.push_tokens;
CREATE POLICY "Cada quien registra su token" ON public.push_tokens
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Cada quien actualiza su token" ON public.push_tokens;
CREATE POLICY "Cada quien actualiza su token" ON public.push_tokens
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Cada quien borra su token" ON public.push_tokens;
CREATE POLICY "Cada quien borra su token" ON public.push_tokens
  FOR DELETE USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2) El envío: una sola llamada a la API de Expo con todos los destinatarios
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enviar_push(
  p_tokens TEXT[],
  p_titulo TEXT,
  p_cuerpo TEXT,
  p_datos JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cuerpo JSONB;
BEGIN
  IF p_tokens IS NULL OR array_length(p_tokens, 1) IS NULL THEN
    RETURN;
  END IF;

  SELECT jsonb_agg(
           jsonb_build_object(
             'to', t,
             'title', p_titulo,
             'body', COALESCE(p_cuerpo, ''),
             'data', COALESCE(p_datos, '{}'::jsonb),
             'sound', 'default',
             'priority', 'high',
             -- El mismo canal de alta prioridad que crea la app (heads-up con sonido).
             'channelId', 'whatsremisse-high-priority'
           )
         )
    INTO v_cuerpo
    FROM unnest(p_tokens) AS t;

  -- Si `pg_net` no está instalada, `net.http_post` no existe: se avisa y se sigue.
  -- El aviso NO puede tumbar la escritura del mensaje o la postulación.
  BEGIN
    PERFORM net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb,
      body := v_cuerpo
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'No se pudo encolar el push de Expo (%): %', SQLERRM, left(v_cuerpo::text, 300);
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Quién recibe: los del OTRO lado de cada conversación
-- ---------------------------------------------------------------------------
-- Los dos del CHAT del servicio: el proveedor y el conductor DE ESA conversación.
-- (No todos los postulantes: el chat es 1 a 1 por conductor, `service_messages.driver_id`,
-- así que un postulante no tiene por qué enterarse de lo que se habla con otro.)
CREATE OR REPLACE FUNCTION public.destinatarios_del_chat(
  p_service_id UUID,
  p_driver_id UUID,
  p_excluir UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS TEXT[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT t.token), ARRAY[]::TEXT[])
    FROM public.push_tokens t
   WHERE t.user_id IN (
           SELECT a.provider_id
             FROM public.service_alerts a
            WHERE a.id = p_service_id
              AND a.provider_id IS NOT NULL
           UNION
           SELECT p_driver_id WHERE p_driver_id IS NOT NULL
         )
     AND NOT (t.user_id = ANY (COALESCE(p_excluir, ARRAY[]::UUID[])));
$$;

-- Solo el proveedor del servicio (el aviso de una postulación nueva es para él).
CREATE OR REPLACE FUNCTION public.destinatarios_del_proveedor(
  p_service_id UUID,
  p_excluir UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS TEXT[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT t.token), ARRAY[]::TEXT[])
    FROM public.push_tokens t
   WHERE t.user_id IN (
           SELECT a.provider_id
             FROM public.service_alerts a
            WHERE a.id = p_service_id
              AND a.provider_id IS NOT NULL
         )
     AND NOT (t.user_id = ANY (COALESCE(p_excluir, ARRAY[]::UUID[])));
$$;

-- Los integrantes del grupo (menos quien escribe).
CREATE OR REPLACE FUNCTION public.destinatarios_del_grupo(
  p_group_id UUID,
  p_excluir UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS TEXT[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT t.token), ARRAY[]::TEXT[])
    FROM public.push_tokens t
    JOIN public.group_members gm ON gm.user_id = t.user_id
   WHERE gm.group_id = p_group_id
     AND NOT (t.user_id = ANY (COALESCE(p_excluir, ARRAY[]::UUID[])));
$$;

-- ---------------------------------------------------------------------------
-- 4) Disparadores: por cada mensaje, por cada hito y por cada tarjeta/postulación
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.push_del_mensaje_del_servicio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_excluir UUID[] := ARRAY[]::UUID[];
  v_titulo TEXT;
  v_datos JSONB;
BEGIN
  IF NEW.sender_id IS NOT NULL THEN
    v_excluir := array_append(v_excluir, NEW.sender_id);
  END IF;

  -- Los tres hitos del viaje los provoca el conductor asignado (que es el que desliza
  -- la barra): no se le avisa a él. Textos copiados de AVISOS_DEL_HITO (ver cabecera).
  IF NEW.type = 'SYSTEM'
     AND NEW.content IN (
       'Sistema: Conductor en el punto de origen (Ubicado).',
       'Sistema: Viaje iniciado.',
       'Sistema: Viaje finalizado.'
     ) THEN
    IF NEW.driver_id IS NOT NULL THEN
      v_excluir := array_append(v_excluir, NEW.driver_id);
    END IF;
    v_titulo := 'Hito del viaje';
    v_datos := jsonb_build_object('serviceId', NEW.service_id, 'type', 'SERVICE_STEP');
  ELSE
    v_titulo := CASE NEW.type
                  WHEN 'VOICE' THEN 'Nueva nota de voz'
                  WHEN 'PHOTO' THEN 'Nueva foto en el chat'
                  WHEN 'LOCATION' THEN 'Ubicación compartida en el chat'
                  WHEN 'CONTACT' THEN 'Contacto compartido en el chat'
                  WHEN 'SYSTEM' THEN 'Aviso del servicio'
                  ELSE 'Nuevo mensaje'
                END;
    v_datos := jsonb_build_object('serviceId', NEW.service_id, 'type', 'CHAT');
  END IF;

  PERFORM public.enviar_push(
    public.destinatarios_del_chat(NEW.service_id, NEW.driver_id, v_excluir),
    v_titulo,
    left(regexp_replace(COALESCE(NEW.content, ''), '^Sistema:\s*', ''), 120),
    v_datos
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.push_del_mensaje_del_grupo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_titulo TEXT;
BEGIN
  v_titulo := CASE NEW.type
                WHEN 'VOICE' THEN 'Nueva nota de voz en el grupo'
                WHEN 'PHOTO' THEN 'Nueva foto en el grupo'
                WHEN 'LOCATION' THEN 'Ubicación compartida en el grupo'
                WHEN 'CONTACT' THEN 'Contacto compartido en el grupo'
                ELSE 'Nuevo mensaje en el grupo'
              END;

  PERFORM public.enviar_push(
    public.destinatarios_del_grupo(NEW.group_id, ARRAY[NEW.sender_id]),
    v_titulo,
    left(COALESCE(NEW.content, ''), 120),
    jsonb_build_object('groupId', NEW.group_id, 'type', 'GROUP_CHAT')
  );

  RETURN NEW;
END;
$$;

-- Tarjeta de servicio: el aviso sale cuando la tarjeta SE COMPARTE a un grupo. Tiene que
-- ser aquí y no en el INSERT de `service_alerts`: cuando la fila del servicio se crea
-- todavía no hay grupos asociados (el proveedor los elige después), así que en ese momento
-- no habría a quién avisar. Compartir a un grupo que ya la tenía no vuelve a avisar (esa
-- fila choca con la clave y la RPC de la 0018 la actualiza, no la inserta).
CREATE OR REPLACE FUNCTION public.push_de_la_tarjeta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_titulo TEXT;
  v_provider UUID;
BEGIN
  SELECT a.title, a.provider_id INTO v_titulo, v_provider
    FROM public.service_alerts a
   WHERE a.id = NEW.service_id;

  PERFORM public.enviar_push(
    public.destinatarios_del_grupo(
      NEW.group_id,
      CASE WHEN v_provider IS NULL THEN ARRAY[]::UUID[] ELSE ARRAY[v_provider] END
    ),
    'Nuevo servicio compartido',
    left(COALESCE(v_titulo, 'Tienes un nuevo servicio disponible'), 120),
    jsonb_build_object('serviceId', NEW.service_id, 'type', 'SERVICE_CARD')
  );

  RETURN NEW;
END;
$$;

-- Postulación nueva (al proveedor) y postulación aprobada (al conductor).
CREATE OR REPLACE FUNCTION public.push_de_la_postulacion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_titulo_servicio TEXT;
  v_provider UUID;
BEGIN
  SELECT a.title, a.provider_id INTO v_titulo_servicio, v_provider
    FROM public.service_alerts a
   WHERE a.id = NEW.service_id;

  IF TG_OP = 'INSERT' THEN
    -- La postulación la recibe el proveedor del servicio (el conductor la acaba de hacer).
    PERFORM public.enviar_push(
      public.destinatarios_del_proveedor(NEW.service_id, ARRAY[NEW.driver_id]),
      'Nueva postulación',
      left('Un conductor se postuló a: ' || COALESCE(v_titulo_servicio, 'tu servicio'), 120),
      jsonb_build_object('serviceId', NEW.service_id, 'type', 'APPLICATION')
    );
    RETURN NEW;
  END IF;

  -- Al aprobar (o rechazar) el aviso va al CONDUCTOR que se postuló: antes se avisaba en el
  -- teléfono del proveedor, que es quien acepta, así que el conductor no se enteraba.
  IF NEW.status <> COALESCE(OLD.status, '') THEN
    IF NEW.status = 'APPROVED' THEN
      PERFORM public.enviar_push(
        ARRAY(SELECT t.token FROM public.push_tokens t WHERE t.user_id = NEW.driver_id),
        '¡Postulación aceptada!',
        left('Fuiste seleccionado para el servicio: ' || COALESCE(v_titulo_servicio, 'tu servicio'), 120),
        jsonb_build_object('serviceId', NEW.service_id, 'type', 'APPLICATION')
      );
    ELSIF NEW.status = 'REJECTED' THEN
      PERFORM public.enviar_push(
        ARRAY(SELECT t.token FROM public.push_tokens t WHERE t.user_id = NEW.driver_id),
        'Postulación no seleccionada',
        left('El proveedor eligió a otro conductor para: ' || COALESCE(v_titulo_servicio, 'el servicio'), 120),
        jsonb_build_object('serviceId', NEW.service_id, 'type', 'APPLICATION')
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_del_mensaje_del_servicio ON public.service_messages;
CREATE TRIGGER push_del_mensaje_del_servicio
  AFTER INSERT ON public.service_messages
  FOR EACH ROW EXECUTE FUNCTION public.push_del_mensaje_del_servicio();

DROP TRIGGER IF EXISTS push_del_mensaje_del_grupo ON public.messages;
CREATE TRIGGER push_del_mensaje_del_grupo
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.push_del_mensaje_del_grupo();

DROP TRIGGER IF EXISTS push_de_la_tarjeta ON public.service_alert_groups;
CREATE TRIGGER push_de_la_tarjeta
  AFTER INSERT ON public.service_alert_groups
  FOR EACH ROW EXECUTE FUNCTION public.push_de_la_tarjeta();

DROP TRIGGER IF EXISTS push_de_la_postulacion ON public.applications;
CREATE TRIGGER push_de_la_postulacion
  AFTER INSERT OR UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.push_de_la_postulacion();

-- `pg_net` es la que hace las llamadas HTTP desde la base. Si falla, se aplica el resto
-- y hay que activarla desde el panel de Supabase (Database → Extensions → pg_net).
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

NOTIFY pgrst, 'reload schema';

-- Comprobación rápida después de aplicar:
--   SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'push%';
--   SELECT count(*) FROM public.push_tokens;
