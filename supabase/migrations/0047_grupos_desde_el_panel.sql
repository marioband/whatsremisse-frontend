-- ============================================
-- 0047 · Grupos desde el panel: crear un grupo y cargar sus integrantes desde un archivo
-- ============================================
-- Pedido del usuario (25-09-2026): «necesito la opción de crear grupos y cargar a los integrantes
-- mediante Excel». Respuestas suyas de esa ronda:
--   · se hace en el PANEL DE ADMINISTRACIÓN (desde la computadora), y desde ahí también se crea el grupo;
--   · el archivo trae SOLO TELÉFONOS (una columna), hasta 1.000 por archivo, guardado como CSV;
--   · si un teléfono NO tiene cuenta todavía, se le guarda la INVITACIÓN y entra al grupo la primera
--     vez que se registre con ese número.
--
-- Qué trae esta migración:
--   1) `normalizar_telefono(text)`: deja un teléfono en sus 9 dígitos (`+51951921501` y `951921501`
--      son el MISMO número; en la base hay de las dos formas).
--   2) `group_invites`: los teléfonos invitados a un grupo que todavía no tienen cuenta. Nadie la lee
--      por la API (lleva teléfonos de personas).
--   3) Un disparador en `profiles`: cuando alguien se registra (o le aparece el teléfono), se aceptan
--      solas las invitaciones que le tocan y queda dentro del grupo.
--   4) Las funciones del panel: `panel_grupos`, `panel_grupo`, `panel_crear_grupo`,
--      `panel_cargar_integrantes` (con modo SIMULADO, para ver qué va a pasar antes de aplicarlo),
--      `panel_quitar_integrante`, `panel_quitar_invitacion` y `panel_cambiar_dueno`.
--      Todas con el candado de la 0046 (`panel_exige_admin()`) y todas dejan su fila en el registro.
--
-- DEPENDE de: 0002 (groups, group_members), 0046 (panel_exige_admin, panel_anota). Si falla, el
-- mensaje nombra el archivo que falta.
--
-- Aplicar con:
--   cat supabase/migrations/0047_grupos_desde_el_panel.sql | docker exec -i supabase-db psql -U supabase_admin -d postgres
-- Idempotente: se puede volver a ejecutar sin efectos nuevos.

BEGIN;

-- ============================================
-- 0) Dependencias: fallar aquí y no a medias
-- ============================================
DO $$
BEGIN
  IF to_regprocedure('public.panel_exige_admin()') IS NULL
     OR to_regprocedure('public.panel_anota(uuid, text, uuid, jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Falta aplicar la migracion 0046_panel_de_administracion.sql antes que esta (no existe el panel)';
  END IF;
  IF to_regclass('public.group_members') IS NULL THEN
    RAISE EXCEPTION 'Falta aplicar la migracion 0002_groups_and_messages.sql antes que esta (no existe group_members)';
  END IF;
END;
$$;

-- ============================================
-- 1) Un teléfono, siempre igual: sus 9 dígitos
-- ============================================
-- En la base hay números de las dos formas (`+51951921501` y `951921501`) y son la misma persona:
-- comparar en crudo haría que el mismo conductor contara como dos. Esta función es el único sitio
-- donde se decide qué es «el mismo número».
CREATE OR REPLACE FUNCTION public.normalizar_telefono(p_telefono TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_telefono IS NULL THEN NULL
    WHEN length(regexp_replace(p_telefono, '\D', '', 'g')) = 0 THEN NULL
    ELSE right(regexp_replace(p_telefono, '\D', '', 'g'), 9)
  END;
$$;

COMMENT ON FUNCTION public.normalizar_telefono(TEXT) IS
  'Deja un teléfono en sus 9 dígitos (últimos 9). +51951921501 y 951921501 dan lo mismo.';

-- Índice para buscar por teléfono normalizado (el listado del panel y la carga masiva).
CREATE INDEX IF NOT EXISTS idx_profiles_telefono_normalizado
  ON public.profiles (public.normalizar_telefono(phone));

-- ============================================
-- 2) Las invitaciones (teléfonos sin cuenta todavía)
-- ============================================
CREATE TABLE IF NOT EXISTS public.group_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  /** El teléfono normalizado (9 dígitos): es la clave con la que se busca al registrarse. */
  phone TEXT NOT NULL,
  /** El teléfono tal como venía en el archivo (para poder enseñarlo y buscar fallos). */
  telefono_escrito TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  aceptada_at TIMESTAMPTZ,
  aceptada_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_group_invites_grupo_telefono
  ON public.group_invites (group_id, phone);
CREATE INDEX IF NOT EXISTS idx_group_invites_pendientes
  ON public.group_invites (phone) WHERE aceptada_at IS NULL;

-- Nadie la lee por la API: solo el panel (funciones SECURITY DEFINER). Lleva teléfonos de personas.
ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.group_invites FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.group_invites FROM anon;
  END IF;
END $$;

-- ============================================
-- 3) Al registrarse, las invitaciones se aceptan solas
-- ============================================
-- El alta de la app es un upsert sobre `profiles` (AuthContext → completeProfileSetup): con un
-- disparador aquí, la persona entra al grupo sin que nadie toque nada más.
CREATE OR REPLACE FUNCTION public.aceptar_invitaciones_del_telefono()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_telefono TEXT;
  v_invitacion RECORD;
  v_cuantas INT := 0;
BEGIN
  v_telefono := public.normalizar_telefono(NEW.phone);
  IF v_telefono IS NULL THEN
    RETURN NEW;
  END IF;

  -- En un UPDATE solo interesa si el teléfono APARECIÓ o CAMBIÓ.
  IF TG_OP = 'UPDATE' AND public.normalizar_telefono(OLD.phone) IS NOT DISTINCT FROM v_telefono THEN
    RETURN NEW;
  END IF;

  FOR v_invitacion IN
    SELECT i.id, i.group_id
    FROM public.group_invites i
    WHERE i.phone = v_telefono AND i.aceptada_at IS NULL
  LOOP
    INSERT INTO public.group_members (group_id, user_id, role)
    VALUES (v_invitacion.group_id, NEW.id, 'member')
    ON CONFLICT (group_id, user_id) DO NOTHING;

    UPDATE public.group_invites
       SET aceptada_at = now(), aceptada_por = NEW.id
     WHERE id = v_invitacion.id;

    v_cuantas := v_cuantas + 1;
  END LOOP;

  IF v_cuantas > 0 THEN
    RAISE NOTICE 'Aceptadas % invitacion(es) pendientes para el telefono %', v_cuantas, v_telefono;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aceptar_invitaciones_al_entrar ON public.profiles;
CREATE TRIGGER aceptar_invitaciones_al_entrar
  AFTER INSERT OR UPDATE OF phone ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.aceptar_invitaciones_del_telefono();

-- ============================================
-- 4) El listado de grupos del panel
-- ============================================
CREATE OR REPLACE FUNCTION public.panel_grupos(
  p_busqueda TEXT DEFAULT NULL,
  p_limite INT DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  owner_id UUID,
  owner_phone TEXT,
  owner_name TEXT,
  integrantes BIGINT,
  invitados BIGINT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_admin UUID := public.panel_exige_admin();
  v_busqueda TEXT := nullif(btrim(coalesce(p_busqueda, '')), '');
  v_limite INT := least(greatest(coalesce(p_limite, 100), 1), 500);
BEGIN
  RETURN QUERY
  SELECT
    g.id,
    g.name,
    g.owner_id,
    o.phone,
    o.full_name,
    (SELECT count(*) FROM public.group_members gm WHERE gm.group_id = g.id),
    (SELECT count(*) FROM public.group_invites i WHERE i.group_id = g.id AND i.aceptada_at IS NULL),
    g.created_at
  FROM public.groups g
  LEFT JOIN public.profiles o ON o.id = g.owner_id
  WHERE v_busqueda IS NULL
     OR g.name ILIKE '%' || v_busqueda || '%'
     OR coalesce(o.phone, '') ILIKE '%' || v_busqueda || '%'
     OR coalesce(o.full_name, '') ILIKE '%' || v_busqueda || '%'
     OR public.normalizar_telefono(o.phone) = public.normalizar_telefono(v_busqueda)
  ORDER BY g.created_at DESC
  LIMIT v_limite;
END;
$$;

-- ============================================
-- 5) Un grupo con sus integrantes y sus invitados
-- ============================================
CREATE OR REPLACE FUNCTION public.panel_grupo(p_grupo UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_admin UUID := public.panel_exige_admin();
  v_grupo RECORD;
BEGIN
  SELECT g.id, g.name, g.owner_id, g.created_at INTO v_grupo
  FROM public.groups g WHERE g.id = p_grupo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ese grupo no existe' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'id', v_grupo.id,
    'nombre', v_grupo.name,
    'dueno_id', v_grupo.owner_id,
    'dueno_phone', (SELECT p.phone FROM public.profiles p WHERE p.id = v_grupo.owner_id),
    'dueno_nombre', (SELECT p.full_name FROM public.profiles p WHERE p.id = v_grupo.owner_id),
    'creado_at', v_grupo.created_at,
    'integrantes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'phone', p.phone,
        'nombre', p.full_name,
        'rol', m.role,
        'es_dueno', (m.user_id = v_grupo.owner_id),
        'joined_at', m.joined_at
      ) ORDER BY (m.user_id = v_grupo.owner_id) DESC, m.joined_at)
      FROM public.group_members m
      LEFT JOIN public.profiles p ON p.id = m.user_id
      WHERE m.group_id = v_grupo.id
    ), '[]'::jsonb),
    'invitados', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id,
        'phone', i.phone,
        'telefono_escrito', i.telefono_escrito,
        'creado_at', i.created_at
      ) ORDER BY i.created_at)
      FROM public.group_invites i
      WHERE i.group_id = v_grupo.id AND i.aceptada_at IS NULL
    ), '[]'::jsonb)
  );
END;
$$;

-- ============================================
-- 6) Crear un grupo
-- ============================================
-- El dueño se elige (no tiene por defecto al administrador): el grupo vive de alguien, y su dueño
-- es quien lo ve en su app.
CREATE OR REPLACE FUNCTION public.panel_crear_grupo(p_nombre TEXT, p_dueno UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin UUID := public.panel_exige_admin();
  v_nombre TEXT := btrim(coalesce(p_nombre, ''));
  v_dueno RECORD;
  v_grupo UUID;
BEGIN
  IF v_nombre = '' THEN
    RAISE EXCEPTION 'El grupo necesita un nombre' USING ERRCODE = '22023';
  END IF;
  IF length(v_nombre) > 60 THEN
    RAISE EXCEPTION 'El nombre del grupo no puede pasar de 60 letras' USING ERRCODE = '22023';
  END IF;

  SELECT p.id, p.phone, p.full_name INTO v_dueno FROM public.profiles p WHERE p.id = p_dueno;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa cuenta (la del dueño) no existe' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.groups (name, owner_id) VALUES (v_nombre, p_dueno) RETURNING id INTO v_grupo;

  -- El dueño es integrante de su propio grupo (como hace la app al crearlo).
  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_grupo, p_dueno, 'owner')
  ON CONFLICT (group_id, user_id) DO UPDATE SET role = 'owner';

  PERFORM public.panel_anota(
    v_admin, 'GRUPO_CREADO', p_dueno,
    jsonb_build_object('grupo', v_grupo, 'nombre', v_nombre, 'dueno_phone', v_dueno.phone)
  );

  RETURN jsonb_build_object('id', v_grupo, 'nombre', v_nombre, 'dueno_phone', v_dueno.phone);
END;
$$;

-- ============================================
-- 7) La carga masiva de integrantes (con modo simulado)
-- ============================================
-- `p_simular = true` cuenta lo que PASARÍA sin escribir nada: la pantalla lo enseña y el
-- administrador decide. Es la misma función, así que lo simulado y lo real no pueden discrepar.
CREATE OR REPLACE FUNCTION public.panel_cargar_integrantes(
  p_grupo UUID,
  p_lineas TEXT[],
  p_simular BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin UUID := public.panel_exige_admin();
  v_simular BOOLEAN := coalesce(p_simular, false);
  v_lineas INT := coalesce(array_length(p_lineas, 1), 0);
  v_linea TEXT;
  v_telefono TEXT;
  v_vistos TEXT[] := '{}';
  v_invalidos TEXT[] := '{}';
  v_usuario UUID;
  v_agregados INT := 0;
  v_ya_estaban INT := 0;
  v_invitados INT := 0;
  v_repetidos INT := 0;
  v_grupo_nombre TEXT;
BEGIN
  SELECT g.name INTO v_grupo_nombre FROM public.groups g WHERE g.id = p_grupo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ese grupo no existe' USING ERRCODE = 'P0002';
  END IF;

  IF v_lineas = 0 THEN
    RAISE EXCEPTION 'El archivo no trae ninguna linea' USING ERRCODE = '22023';
  END IF;
  IF v_lineas > 1000 THEN
    RAISE EXCEPTION 'El archivo trae % lineas y el tope son 1000: dividelo en dos archivos', v_lineas
      USING ERRCODE = '22023';
  END IF;

  FOREACH v_linea IN ARRAY p_lineas LOOP
    v_telefono := public.normalizar_telefono(v_linea);

    -- Un celular peruano: 9 dígitos y empieza por 9. Lo demás se informa, no se adivina.
    IF v_telefono IS NULL OR length(v_telefono) <> 9 OR left(v_telefono, 1) <> '9' THEN
      IF nullif(btrim(coalesce(v_linea, '')), '') IS NOT NULL
         AND coalesce(array_length(v_invalidos, 1), 0) < 50 THEN
        v_invalidos := v_invalidos || left(btrim(v_linea), 20);
      END IF;
      CONTINUE;
    END IF;

    IF v_telefono = ANY(v_vistos) THEN
      v_repetidos := v_repetidos + 1;
      CONTINUE;
    END IF;
    v_vistos := v_vistos || v_telefono;

    SELECT p.id INTO v_usuario
    FROM public.profiles p
    WHERE public.normalizar_telefono(p.phone) = v_telefono
    LIMIT 1;

    IF v_usuario IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.group_members gm
        WHERE gm.group_id = p_grupo AND gm.user_id = v_usuario
      ) THEN
        v_ya_estaban := v_ya_estaban + 1;
      ELSE
        IF NOT v_simular THEN
          INSERT INTO public.group_members (group_id, user_id, role)
          VALUES (p_grupo, v_usuario, 'member');
        END IF;
        v_agregados := v_agregados + 1;
      END IF;
    ELSE
      IF NOT v_simular THEN
        INSERT INTO public.group_invites (group_id, phone, telefono_escrito, created_by)
        VALUES (p_grupo, v_telefono, left(coalesce(v_linea, ''), 40), v_admin)
        ON CONFLICT (group_id, phone) DO UPDATE SET telefono_escrito = EXCLUDED.telefono_escrito;
      END IF;
      v_invitados := v_invitados + 1;
    END IF;
  END LOOP;

  IF NOT v_simular THEN
    PERFORM public.panel_anota(
      v_admin, 'INTEGRANTES_CARGADOS', NULL,
      jsonb_build_object(
        'grupo', p_grupo, 'nombre', v_grupo_nombre, 'leidos', v_lineas,
        'con_cuenta', v_agregados, 'ya_estaban', v_ya_estaban, 'invitados', v_invitados,
        'repetidos', v_repetidos, 'invalidos', coalesce(array_length(v_invalidos, 1), 0)
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'simulado', v_simular,
    'grupo', p_grupo,
    'nombre', v_grupo_nombre,
    'leidos', v_lineas,
    'con_cuenta', v_agregados,
    'ya_estaban', v_ya_estaban,
    'invitados', v_invitados,
    'repetidos', v_repetidos,
    'total_invalidos', coalesce(array_length(v_invalidos, 1), 0),
    'invalidos', to_jsonb(v_invalidos)
  );
END;
$$;

-- ============================================
-- 8) Corregir a mano: quitar a alguien, quitar una invitación, cambiar el dueño
-- ============================================
CREATE OR REPLACE FUNCTION public.panel_quitar_integrante(p_grupo UUID, p_usuario UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin UUID := public.panel_exige_admin();
  v_dueno UUID;
  v_phone TEXT;
BEGIN
  SELECT g.owner_id INTO v_dueno FROM public.groups g WHERE g.id = p_grupo;
  IF v_dueno IS NULL THEN
    RAISE EXCEPTION 'Ese grupo no existe' USING ERRCODE = 'P0002';
  END IF;
  IF v_dueno = p_usuario THEN
    RAISE EXCEPTION 'El dueño no se puede quitar del grupo: primero cambia quién es el dueño'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT p.phone INTO v_phone FROM public.profiles p WHERE p.id = p_usuario;

  DELETE FROM public.group_members WHERE group_id = p_grupo AND user_id = p_usuario;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa persona no está en el grupo' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.panel_anota(
    v_admin, 'INTEGRANTE_QUITADO', p_usuario,
    jsonb_build_object('grupo', p_grupo, 'usuario_phone', v_phone)
  );

  RETURN jsonb_build_object('grupo', p_grupo, 'usuario', p_usuario);
END;
$$;

CREATE OR REPLACE FUNCTION public.panel_quitar_invitacion(p_invitacion UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin UUID := public.panel_exige_admin();
  v_fila RECORD;
BEGIN
  SELECT i.id, i.group_id, i.phone INTO v_fila
  FROM public.group_invites i WHERE i.id = p_invitacion AND i.aceptada_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa invitación ya no está pendiente' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.group_invites WHERE id = p_invitacion;

  PERFORM public.panel_anota(
    v_admin, 'INVITACION_QUITADA', NULL,
    jsonb_build_object('grupo', v_fila.group_id, 'telefono', v_fila.phone)
  );

  RETURN jsonb_build_object('grupo', v_fila.group_id, 'telefono', v_fila.phone);
END;
$$;

CREATE OR REPLACE FUNCTION public.panel_cambiar_dueno(p_grupo UUID, p_dueno UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin UUID := public.panel_exige_admin();
  v_antes UUID;
  v_phone TEXT;
BEGIN
  SELECT g.owner_id INTO v_antes FROM public.groups g WHERE g.id = p_grupo;
  IF v_antes IS NULL THEN
    RAISE EXCEPTION 'Ese grupo no existe' USING ERRCODE = 'P0002';
  END IF;

  SELECT p.phone INTO v_phone FROM public.profiles p WHERE p.id = p_dueno;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa cuenta (la del dueño nuevo) no existe' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.groups SET owner_id = p_dueno, updated_at = now() WHERE id = p_grupo;

  -- El dueño nuevo entra al grupo como dueño; el anterior se queda como integrante normal.
  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (p_grupo, p_dueno, 'owner')
  ON CONFLICT (group_id, user_id) DO UPDATE SET role = 'owner';

  UPDATE public.group_members SET role = 'member'
   WHERE group_id = p_grupo AND user_id = v_antes AND user_id <> p_dueno;

  PERFORM public.panel_anota(
    v_admin, 'DUENO_CAMBIADO', p_dueno,
    jsonb_build_object('grupo', p_grupo, 'antes', v_antes, 'ahora', p_dueno, 'dueno_phone', v_phone)
  );

  RETURN jsonb_build_object('grupo', p_grupo, 'dueno', p_dueno, 'dueno_phone', v_phone);
END;
$$;

-- ============================================
-- Permisos: solo con sesión, y el candado dentro de cada función
-- ============================================
REVOKE ALL ON FUNCTION public.normalizar_telefono(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aceptar_invitaciones_del_telefono() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.panel_grupos(TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.panel_grupo(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.panel_crear_grupo(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.panel_cargar_integrantes(UUID, TEXT[], BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.panel_quitar_integrante(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.panel_quitar_invitacion(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.panel_cambiar_dueno(UUID, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.panel_grupos(TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.panel_grupo(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.panel_crear_grupo(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.panel_cargar_integrantes(UUID, TEXT[], BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.panel_quitar_integrante(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.panel_quitar_invitacion(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.panel_cambiar_dueno(UUID, UUID) TO authenticated;

-- ============================================
-- Comprobaciones
-- ============================================
-- ¿Cuántos grupos hay y de quién son?
--   SELECT g.name, p.phone, count(m.*) FROM public.groups g
--     JOIN public.profiles p ON p.id = g.owner_id
--     LEFT JOIN public.group_members m ON m.group_id = g.id GROUP BY 1,2;
-- ¿Invitaciones pendientes?
--   SELECT i.phone, g.name FROM public.group_invites i JOIN public.groups g ON g.id = i.group_id
--    WHERE i.aceptada_at IS NULL ORDER BY i.created_at;
-- ¿Los mismos 9 dígitos? (las dos formas del teléfono dan lo mismo)
--   SELECT public.normalizar_telefono('+51951921501'), public.normalizar_telefono('951921501');

NOTIFY pgrst, 'reload schema';

COMMIT;
