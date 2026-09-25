-- ============================================
-- 0046 · Panel de administración (1ª entrega)
-- ============================================
-- Qué resuelve
-- ------------
-- Hasta hoy NINGÚN administrador podía ver el panel, por dos motivos:
--   1) la app regala premium a todos (`PREMIUM_PARA_TODOS` en `src/lib/premium.ts`), así que
--      activar o quitar una membresía no cambiaba nada;
--   2) la base solo deja leer la PROPIA fila de `profiles` («Profiles own read», 0001), así que
--      una pantalla de administración salía vacía.
--
-- Esta migración trae las tres piezas que faltan:
--   A) `platform_settings`: una sola fila con el interruptor «modo pruebas» (`premium_para_todos`)
--      que el administrador enciende o apaga DESDE el panel, sin recompilar la app.
--   B) Las funciones del panel (`panel_resumen`, `panel_usuarios`, `panel_activar_membresia`,
--      `panel_quitar_membresia`, `panel_cambiar_rol`, `panel_modo_pruebas`), todas SECURITY
--      DEFINER y todas con la MISMA comprobación por delante: `panel_exige_admin()`. El candado
--      no está en la pantalla ni en una URL escondida: sin `profiles.role = 'ADMIN'` la base no
--      devuelve ni un dato y no deja cambiar nada.
--   C) `panel_acciones`: el registro de lo que cada administrador tocó (quién, a quién, cuándo y
--      qué valores había antes). Un panel que mueve dinero sin registro no se puede auditar.
--
-- DEPENDENCIAS (si esta migración falla, es por esto):
--   · 0008_premium.sql  → `public.is_app_admin(uuid)`, `profiles.tier`,
--                         `profiles.subscription_expires_at`.
--   · 0009_posiciones.sql → `profiles.last_seen_at` (última vez que el teléfono publicó su
--                           posición; es la única señal de «entró hace poco» que existe hoy).
--   En producción las dos están aplicadas y comprobadas (25-09-2026).
--
-- Aplicar con:
--   cat supabase/migrations/0046_panel_de_administracion.sql | docker exec -i supabase-db psql -U supabase_admin -d postgres
-- Idempotente: se puede volver a ejecutar sin efectos nuevos.
--
-- Para ENTRAR al panel hace falta que tu cuenta tenga `role = 'ADMIN'`. Si no hay ninguna:
--   UPDATE public.profiles SET role = 'ADMIN' WHERE phone = 'TU_NUMERO';

-- ============================================
-- 0) Dependencias: fallar AQUÍ y no a medias
-- ============================================
BEGIN;
DO $$
BEGIN
  IF to_regprocedure('public.is_app_admin(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta aplicar la migracion 0008_premium.sql antes que esta (no existe public.is_app_admin)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'last_seen_at'
  ) THEN
    RAISE EXCEPTION 'Falta aplicar la migracion 0009_posiciones.sql antes que esta (no existe profiles.last_seen_at)';
  END IF;
END;
$$;

-- ============================================
-- A) El interruptor de la etapa de pruebas
-- ============================================
-- Una sola fila (`id = true`). `premium_para_todos = true` = como hasta ahora (todos premium);
-- `false` = manda `profiles.tier`, es decir, lo que el panel decide cuenta por cuenta.
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  premium_para_todos BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.platform_settings (id, premium_para_todos)
VALUES (true, true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- La app necesita LEER el interruptor para saber si manda la base o la etapa de pruebas.
-- Escribirlo solo se puede desde las funciones del panel (SECURITY DEFINER): no hay política
-- de UPDATE ni de INSERT, así que nadie lo cambia con un PATCH.
DROP POLICY IF EXISTS "Ajustes de la plataforma legibles" ON public.platform_settings;
CREATE POLICY "Ajustes de la plataforma legibles"
  ON public.platform_settings FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.platform_settings TO authenticated;

-- ============================================
-- B) El registro de lo que hace el administrador
-- ============================================
CREATE TABLE IF NOT EXISTS public.panel_acciones (
  id BIGSERIAL PRIMARY KEY,
  creado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  admin_phone TEXT,
  accion TEXT NOT NULL,
  usuario_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  usuario_phone TEXT,
  detalle JSONB
);

CREATE INDEX IF NOT EXISTS idx_panel_acciones_creado ON public.panel_acciones (creado_at DESC);

ALTER TABLE public.panel_acciones ENABLE ROW LEVEL SECURITY;

-- Solo el administrador lee el registro (y se lee, nunca se escribe a mano: lo escriben las
-- funciones de abajo, que son las que saben qué cambió).
DROP POLICY IF EXISTS "Solo el administrador lee el registro" ON public.panel_acciones;
CREATE POLICY "Solo el administrador lee el registro"
  ON public.panel_acciones FOR SELECT
  TO authenticated
  USING (public.is_app_admin(auth.uid()));

GRANT SELECT ON public.panel_acciones TO authenticated;

-- Índice que ayuda al listado del panel (por más reciente).
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON public.profiles (created_at DESC);

-- ============================================
-- El candado: una sola puerta para todas las funciones del panel
-- ============================================
CREATE OR REPLACE FUNCTION public.panel_exige_admin()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Necesitas iniciar sesion para abrir el panel' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_app_admin(v_uid) THEN
    RAISE EXCEPTION 'Esta seccion es solo para administradores' USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END;
$$;

-- Anotar en el registro. Es interna: no se concede a nadie.
CREATE OR REPLACE FUNCTION public.panel_anota(
  p_admin UUID,
  p_accion TEXT,
  p_usuario UUID DEFAULT NULL,
  p_detalle JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.panel_acciones (admin_id, admin_phone, accion, usuario_id, usuario_phone, detalle)
  VALUES (
    p_admin,
    (SELECT p.phone FROM public.profiles p WHERE p.id = p_admin),
    p_accion,
    p_usuario,
    (SELECT p.phone FROM public.profiles p WHERE p.id = p_usuario),
    p_detalle
  );
END;
$$;

-- ============================================
-- C) Los números del panel
-- ============================================
CREATE OR REPLACE FUNCTION public.panel_resumen()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_admin UUID := public.panel_exige_admin();
BEGIN
  RETURN jsonb_build_object(
    'modo_pruebas', coalesce((SELECT s.premium_para_todos FROM public.platform_settings s WHERE s.id), true),
    'calculado_at', now(),
    'cuentas', jsonb_build_object(
      'total', (SELECT count(*) FROM public.profiles),
      'proveedores', (SELECT count(*) FROM public.profiles WHERE role = 'PROVIDER'),
      'conductores', (SELECT count(*) FROM public.profiles WHERE role = 'DRIVER'),
      'administradores', (SELECT count(*) FROM public.profiles WHERE role = 'ADMIN'),
      'hoy', (SELECT count(*) FROM public.profiles WHERE created_at >= date_trunc('day', now())),
      'ultimos_7', (SELECT count(*) FROM public.profiles WHERE created_at >= now() - interval '7 days'),
      'ultimos_30', (SELECT count(*) FROM public.profiles WHERE created_at >= now() - interval '30 days')
    ),
    'actividad', jsonb_build_object(
      -- Última vez que el teléfono publicó su posición (0009). Es la única señal de vida que hay.
      'vistos_24h', (SELECT count(*) FROM public.profiles WHERE last_seen_at >= now() - interval '24 hours'),
      'vistos_7d', (SELECT count(*) FROM public.profiles WHERE last_seen_at >= now() - interval '7 days'),
      'con_ubicacion', (SELECT count(*) FROM public.profiles WHERE last_seen_at IS NOT NULL)
    ),
    'membresias', jsonb_build_object(
      'activas', (SELECT count(*) FROM public.profiles
                  WHERE tier = 'PREMIUM' AND (subscription_expires_at IS NULL OR subscription_expires_at > now())),
      'sin_vencimiento', (SELECT count(*) FROM public.profiles
                          WHERE tier = 'PREMIUM' AND subscription_expires_at IS NULL),
      'por_vencer_7', (SELECT count(*) FROM public.profiles
                       WHERE tier = 'PREMIUM' AND subscription_expires_at > now()
                         AND subscription_expires_at <= now() + interval '7 days'),
      'vencidas', (SELECT count(*) FROM public.profiles
                   WHERE tier = 'PREMIUM' AND subscription_expires_at IS NOT NULL
                     AND subscription_expires_at <= now()),
      'sin_membresia', (SELECT count(*) FROM public.profiles
                        WHERE coalesce(upper(tier), '') <> 'PREMIUM')
    ),
    'servicios', jsonb_build_object(
      'total', (SELECT count(*) FROM public.service_alerts),
      'ultimos_30', (SELECT count(*) FROM public.service_alerts WHERE created_at >= now() - interval '30 days'),
      'abiertos', (SELECT count(*) FROM public.service_alerts
                   WHERE status IN ('STATUS_OPEN', 'STATUS_PENDING_APPROVAL') AND assigned_driver_id IS NULL),
      'en_curso', (SELECT count(*) FROM public.service_alerts
                   WHERE assigned_driver_id IS NOT NULL
                     AND status NOT IN ('STATUS_COMPLETED', 'STATUS_CANCELLED')),
      'concluidos', (SELECT count(*) FROM public.service_alerts WHERE status = 'STATUS_COMPLETED'),
      'cancelados', (SELECT count(*) FROM public.service_alerts WHERE status = 'STATUS_CANCELLED'),
      -- Publicados en los últimos 30 días que NADIE postuló y que siguen abiertos (sin conductor):
      -- es el número que dice si falta conductores o si el servicio se publicó mal.
      'sin_postulantes_30', (
        SELECT count(*) FROM public.service_alerts sa
        WHERE sa.created_at >= now() - interval '30 days'
          AND sa.assigned_driver_id IS NULL
          AND sa.status IN ('STATUS_OPEN', 'STATUS_PENDING_APPROVAL')
          AND NOT EXISTS (SELECT 1 FROM public.applications a WHERE a.service_id = sa.id)
      )
    ),
    'postulaciones', jsonb_build_object(
      'total', (SELECT count(*) FROM public.applications),
      'ultimos_30', (SELECT count(*) FROM public.applications WHERE created_at >= now() - interval '30 days'),
      'pendientes', (SELECT count(*) FROM public.applications WHERE status = 'PENDING')
    )
  );
END;
$$;

-- ============================================
-- D) Listado de usuarios (con búsqueda y filtros de membresía)
-- ============================================
CREATE OR REPLACE FUNCTION public.panel_usuarios(
  p_busqueda TEXT DEFAULT NULL,
  p_filtro TEXT DEFAULT 'TODAS',
  p_limite INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  phone TEXT,
  full_name TEXT,
  role TEXT,
  tier TEXT,
  subscription_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  servicios BIGINT,
  postulaciones BIGINT,
  estado TEXT,
  dias_restantes INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_admin UUID := public.panel_exige_admin();
  v_busqueda TEXT := nullif(btrim(coalesce(p_busqueda, '')), '');
  v_filtro TEXT := upper(coalesce(nullif(btrim(p_filtro), ''), 'TODAS'));
  v_limite INT := least(greatest(coalesce(p_limite, 50), 1), 200);
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      p.id AS id,
      p.phone AS phone,
      p.full_name AS full_name,
      p.role AS role,
      p.tier AS tier,
      p.subscription_expires_at AS subscription_expires_at,
      p.created_at AS created_at,
      p.last_seen_at AS last_seen_at,
      (SELECT count(*) FROM public.service_alerts sa WHERE sa.provider_id = p.id) AS servicios,
      (SELECT count(*) FROM public.applications a WHERE a.driver_id = p.id) AS postulaciones
    FROM public.profiles p
    WHERE v_busqueda IS NULL
       OR p.phone ILIKE '%' || v_busqueda || '%'
       OR coalesce(p.full_name, '') ILIKE '%' || v_busqueda || '%'
  ),
  con_estado AS (
    SELECT
      b.*,
      CASE
        WHEN coalesce(upper(b.tier), '') <> 'PREMIUM' THEN 'SIN_MEMBRESIA'
        WHEN b.subscription_expires_at IS NULL THEN 'SIN_VENCIMIENTO'
        WHEN b.subscription_expires_at <= now() THEN 'VENCIDA'
        WHEN b.subscription_expires_at <= now() + interval '7 days' THEN 'POR_VENCER'
        ELSE 'ACTIVA'
      END AS estado,
      CASE
        WHEN b.subscription_expires_at IS NULL THEN NULL
        ELSE ceil(extract(epoch FROM (b.subscription_expires_at - now())) / 86400)::int
      END AS dias_restantes
    FROM base b
  )
  SELECT
    c.id, c.phone, c.full_name, c.role, c.tier, c.subscription_expires_at,
    c.created_at, c.last_seen_at, c.servicios, c.postulaciones, c.estado, c.dias_restantes
  FROM con_estado c
  WHERE v_filtro = 'TODAS'
     OR (v_filtro = 'ACTIVAS' AND c.estado IN ('ACTIVA', 'SIN_VENCIMIENTO'))
     OR (v_filtro = 'POR_VENCER' AND c.estado = 'POR_VENCER')
     OR (v_filtro = 'VENCIDAS' AND c.estado = 'VENCIDA')
     OR (v_filtro = 'SIN_MEMBRESIA' AND c.estado = 'SIN_MEMBRESIA')
  ORDER BY
    CASE c.estado
      WHEN 'POR_VENCER' THEN 0
      WHEN 'VENCIDA' THEN 1
      WHEN 'SIN_MEMBRESIA' THEN 2
      WHEN 'ACTIVA' THEN 3
      ELSE 4
    END,
    c.created_at DESC
  LIMIT v_limite;
END;
$$;

-- ============================================
-- E) Lo que el administrador puede CAMBIAR
-- ============================================
-- Activar o extender una membresía. Si todavía no venció, los días se SUMAN a lo que ya tenía
-- (extender no puede quitarle días a nadie). Con `p_sin_vencimiento` queda sin fecha de corte.
CREATE OR REPLACE FUNCTION public.panel_activar_membresia(
  p_usuario UUID,
  p_dias INT DEFAULT 30,
  p_sin_vencimiento BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin UUID := public.panel_exige_admin();
  v_dias INT := coalesce(p_dias, 30);
  v_sin_vencimiento BOOLEAN := coalesce(p_sin_vencimiento, false);
  v_antes RECORD;
  v_vence TIMESTAMPTZ;
BEGIN
  IF v_dias < 1 OR v_dias > 3650 THEN
    RAISE EXCEPTION 'Los dias de la membresia tienen que estar entre 1 y 3650' USING ERRCODE = '22023';
  END IF;

  SELECT p.id, p.phone, p.tier, p.subscription_expires_at INTO v_antes
  FROM public.profiles p WHERE p.id = p_usuario;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa cuenta no existe' USING ERRCODE = 'P0002';
  END IF;

  IF v_sin_vencimiento THEN
    v_vence := NULL;
  ELSE
    v_vence := greatest(now(), coalesce(v_antes.subscription_expires_at, now())) + make_interval(days => v_dias);
  END IF;

  -- Marca de «estoy escribiendo desde el panel»: es lo que deja pasar el trigger que protege
  -- la membresía (ver la sección F). Es de esta transacción y no sobrevive a la petición.
  PERFORM set_config('whatsremisse.panel', 'on', true);

  UPDATE public.profiles
     SET tier = 'PREMIUM', subscription_expires_at = v_vence, updated_at = now()
   WHERE id = p_usuario;

  PERFORM public.panel_anota(
    v_admin, 'MEMBRESIA_ACTIVADA', p_usuario,
    jsonb_build_object(
      'antes_tier', v_antes.tier,
      'antes_vence', v_antes.subscription_expires_at,
      'dias', v_dias,
      'sin_vencimiento', v_sin_vencimiento,
      'vence', v_vence
    )
  );

  RETURN jsonb_build_object(
    'id', p_usuario, 'phone', v_antes.phone, 'tier', 'PREMIUM',
    'subscription_expires_at', v_vence
  );
END;
$$;

-- Quitar la membresía (la cuenta sigue existiendo, solo deja de ser premium).
CREATE OR REPLACE FUNCTION public.panel_quitar_membresia(p_usuario UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin UUID := public.panel_exige_admin();
  v_antes RECORD;
BEGIN
  SELECT p.id, p.phone, p.tier, p.subscription_expires_at INTO v_antes
  FROM public.profiles p WHERE p.id = p_usuario;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa cuenta no existe' USING ERRCODE = 'P0002';
  END IF;

  PERFORM set_config('whatsremisse.panel', 'on', true);

  UPDATE public.profiles
     SET tier = 'FREE', subscription_expires_at = NULL, updated_at = now()
   WHERE id = p_usuario;

  PERFORM public.panel_anota(
    v_admin, 'MEMBRESIA_QUITADA', p_usuario,
    jsonb_build_object('antes_tier', v_antes.tier, 'antes_vence', v_antes.subscription_expires_at)
  );

  RETURN jsonb_build_object('id', p_usuario, 'phone', v_antes.phone, 'tier', 'FREE',
                            'subscription_expires_at', NULL);
END;
$$;

-- Cambiar el rol. Dos reglas que evitan estados imposibles:
--   · el rol tiene que existir;
--   · NO se puede dejar la plataforma sin ningún administrador (si eres el único, no puedes
--     quitarte el rol: el panel quedaría cerrado para siempre y habría que entrar por psql).
CREATE OR REPLACE FUNCTION public.panel_cambiar_rol(p_usuario UUID, p_rol TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin UUID := public.panel_exige_admin();
  v_rol TEXT := upper(btrim(coalesce(p_rol, '')));
  v_antes RECORD;
  v_admins INT;
BEGIN
  IF v_rol NOT IN ('DRIVER', 'PROVIDER', 'GROUP_OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Rol no valido: % (usa DRIVER, PROVIDER, GROUP_OWNER o ADMIN)', p_rol USING ERRCODE = '22023';
  END IF;

  SELECT p.id, p.phone, p.role INTO v_antes FROM public.profiles p WHERE p.id = p_usuario;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa cuenta no existe' USING ERRCODE = 'P0002';
  END IF;

  IF v_antes.role = 'ADMIN' AND v_rol <> 'ADMIN' THEN
    SELECT count(*) INTO v_admins FROM public.profiles WHERE role = 'ADMIN';
    IF v_admins <= 1 THEN
      RAISE EXCEPTION 'No puedes quitar el ultimo administrador: el panel quedaria sin nadie que pueda entrar'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  PERFORM set_config('whatsremisse.panel', 'on', true);

  UPDATE public.profiles SET role = v_rol, updated_at = now() WHERE id = p_usuario;

  PERFORM public.panel_anota(
    v_admin, 'ROL_CAMBIADO', p_usuario,
    jsonb_build_object('antes', v_antes.role, 'ahora', v_rol)
  );

  RETURN jsonb_build_object('id', p_usuario, 'phone', v_antes.phone, 'role', v_rol);
END;
$$;

-- El interruptor de la etapa de pruebas: true = todos premium (como hasta hoy);
-- false = manda la base, o sea lo que el panel decide cuenta por cuenta.
CREATE OR REPLACE FUNCTION public.panel_modo_pruebas(p_activar BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin UUID := public.panel_exige_admin();
  v_ahora BOOLEAN := coalesce(p_activar, false);
  v_antes BOOLEAN;
BEGIN
  SELECT s.premium_para_todos INTO v_antes FROM public.platform_settings s WHERE s.id;

  UPDATE public.platform_settings SET premium_para_todos = v_ahora, updated_at = now() WHERE id;

  PERFORM public.panel_anota(
    v_admin, 'MODO_PRUEBAS', NULL,
    jsonb_build_object('antes', v_antes, 'ahora', v_ahora)
  );

  RETURN jsonb_build_object('premium_para_todos', v_ahora);
END;
$$;

-- El registro, para la pantalla.
CREATE OR REPLACE FUNCTION public.panel_acciones(p_limite INT DEFAULT 50)
RETURNS TABLE (
  id BIGINT,
  creado_at TIMESTAMPTZ,
  admin_phone TEXT,
  accion TEXT,
  usuario_phone TEXT,
  detalle JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_admin UUID := public.panel_exige_admin();
  v_limite INT := least(greatest(coalesce(p_limite, 50), 1), 500);
BEGIN
  RETURN QUERY
  SELECT a.id, a.creado_at, a.admin_phone, a.accion, a.usuario_phone, a.detalle
  FROM public.panel_acciones a
  ORDER BY a.creado_at DESC
  LIMIT v_limite;
END;
$$;

-- ============================================
-- F) Que nadie se dé premium ni se haga administrador desde su teléfono
-- ============================================
-- El agujero que cierra esto (25-09-2026): la base deja que cada usuario actualice SU fila
-- («Profiles own update», 0001) y esa fila trae `role` y `tier`. Con la app publicada eso
-- significa que cualquiera puede mandar dos peticiones y quedar como administrador con
-- membresía de por vida:
--   PATCH /rest/v1/profiles?id=eq.<mi-id>   {"role":"ADMIN"}
--   PATCH /rest/v1/profiles?id=eq.<mi-id>   {"tier":"PREMIUM","subscription_expires_at":"2099-01-01"}
-- El trigger de abajo lo impide: cambiar `role` a ADMIN, `tier` o el vencimiento desde una sesión
-- de la app solo lo puede hacer un administrador (o las funciones del panel, que se marcan con
-- `whatsremisse.panel = 'on'`). Sin sesión (psql, migraciones, scripts con service_role) no
-- estorba: ahí manda quien tiene la llave de la base.
CREATE OR REPLACE FUNCTION public.protege_la_membresia()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente BOOLEAN := auth.uid() IS NOT NULL;
  v_panel BOOLEAN := coalesce(current_setting('whatsremisse.panel', true), '') = 'on';
BEGIN
  -- Escribir con la llave de la base (psql, migraciones, service_role) o desde el panel: aquí no
  -- se estorba. La llave maestra tiene que poder arreglar siempre lo que la app no deja.
  IF NOT v_cliente OR v_panel THEN
    RETURN NEW;
  END IF;

  -- Nunca dejar la plataforma sin ningún administrador. Vale también para el propio
  -- administrador: si entra a «Mi perfil» y se cambia el rol, se quedaría fuera del panel.
  IF upper(coalesce(OLD.role, '')) = 'ADMIN' AND upper(coalesce(NEW.role, '')) <> 'ADMIN'
     AND (SELECT count(*) FROM public.profiles WHERE role = 'ADMIN') <= 1 THEN
    RAISE EXCEPTION 'No puedes quitar el ultimo administrador: el panel quedaria sin nadie que pueda entrar'
      USING ERRCODE = 'P0001';
  END IF;

  IF public.is_app_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF upper(coalesce(NEW.role, '')) = 'ADMIN' AND upper(coalesce(OLD.role, '')) IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'El rol de administrador solo lo da el panel de administracion' USING ERRCODE = '42501';
  END IF;

  IF NEW.tier IS DISTINCT FROM OLD.tier
     OR NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at THEN
    RAISE EXCEPTION 'La membresia solo la cambia el panel de administracion' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protege_la_membresia ON public.profiles;
CREATE TRIGGER protege_la_membresia
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protege_la_membresia();

-- La MISMA regla al CREAR la cuenta (el alta es un upsert desde el teléfono: sin esto, una
-- cuenta nueva puede nacer con `role = 'ADMIN'`).
CREATE OR REPLACE FUNCTION public.protege_el_alta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND coalesce(current_setting('whatsremisse.panel', true), '') <> 'on'
     AND NOT public.is_app_admin(auth.uid())
     AND upper(coalesce(NEW.role, '')) = 'ADMIN' THEN
    RAISE EXCEPTION 'El rol de administrador solo lo da el panel de administracion' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protege_el_alta ON public.profiles;
CREATE TRIGGER protege_el_alta
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protege_el_alta();

-- Y la cuenta NUEVA empieza gratuita. Antes el valor por defecto era PREMIUM (etapa de pruebas);
-- mientras el interruptor esté encendido nada cambia (todos siguen siendo premium), pero el día
-- que pases a «modo real» las cuentas nuevas ya no nacen premium para siempre.
ALTER TABLE public.profiles ALTER COLUMN tier SET DEFAULT 'FREE';

-- ============================================
-- Permisos: solo lo que la app necesita, y solo con sesión
-- ============================================
REVOKE ALL ON FUNCTION public.panel_exige_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.panel_anota(UUID, TEXT, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.panel_resumen() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.panel_usuarios(TEXT, TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.panel_activar_membresia(UUID, INT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.panel_quitar_membresia(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.panel_cambiar_rol(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.panel_modo_pruebas(BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.panel_acciones(INT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.panel_resumen() TO authenticated;
GRANT EXECUTE ON FUNCTION public.panel_usuarios(TEXT, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.panel_activar_membresia(UUID, INT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.panel_quitar_membresia(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.panel_cambiar_rol(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.panel_modo_pruebas(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.panel_acciones(INT) TO authenticated;

-- ============================================
-- Comprobaciones (para el SQL Editor / psql como supabase_admin)
-- ============================================
-- ¿Hay algún administrador? (sin esto el panel no se puede abrir)
--   SELECT id, phone, role FROM public.profiles WHERE role = 'ADMIN';
-- ¿El interruptor quedó encendido (etapa de pruebas)?
--   SELECT * FROM public.platform_settings;
-- ¿Los números del panel? (desde el SQL Editor corre como dueño y no pasa por el candado)
--   SELECT public.panel_resumen();
-- ¿Qué se ha tocado desde el panel?
--   SELECT creado_at, admin_phone, accion, usuario_phone, detalle FROM public.panel_acciones ORDER BY creado_at DESC;

NOTIFY pgrst, 'reload schema';

COMMIT;
