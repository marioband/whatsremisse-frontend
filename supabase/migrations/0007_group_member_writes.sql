-- ============================================
-- 0007 — Eliminar integrantes y cambiarles el rol por RPC
-- ============================================
-- Por qué existe: el borrado directo por REST (`DELETE /rest/v1/group_members`)
-- depende por completo del estado de las políticas RLS de esa tabla, y en esta
-- base ya quedaron dos veces mal aplicadas (0002 recursiva, 0004/0006 según el
-- caso). Resultado: la app recibe 204 "OK" y 0 filas borradas, sin error, así
-- que el integrante desaparece de la lista y vuelve al recargar.
--
-- Estas funciones hacen el trabajo con SECURITY DEFINER (dentro de una función
-- definer no se aplica RLS) y con su PROPIA autorización:
--   * solo el creador del grupo (groups.owner_id) o un miembro con rol
--     owner/admin pueden borrar o cambiar roles;
--   * la fila del creador no se puede eliminar ni degradar;
--   * el rol 'owner' no se puede asignar desde la app (solo el creador lo es).
-- Además devuelven el número de filas afectadas, así que la app sabe si de
-- verdad pasó algo.
--
-- Idempotente: se puede volver a ejecutar sin efectos nuevos.
-- Aplicar en Supabase Studio > SQL Editor, o con:
--   psql "$DATABASE_URL" -f supabase/migrations/0007_group_member_writes.sql

-- ============================================
-- Función auxiliar (por si la 0004/0006 no están aplicadas)
-- ============================================
CREATE OR REPLACE FUNCTION public.is_group_admin(gid UUID, uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = gid AND user_id = uid AND role IN ('owner', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION public.is_group_admin(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_group_admin(UUID, UUID) TO authenticated;

-- ============================================
-- Eliminar un integrante
-- ============================================
CREATE OR REPLACE FUNCTION public.remove_group_member(p_group_id UUID, p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_creador UUID;
  v_borradas INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa. Vuelve a iniciar sesión.'
      USING ERRCODE = '28000';
  END IF;

  SELECT g.owner_id INTO v_creador FROM public.groups g WHERE g.id = p_group_id;
  IF v_creador IS NULL THEN
    RAISE EXCEPTION 'El grupo no existe o fue eliminado.'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_user_id = v_creador THEN
    RAISE EXCEPTION 'El creador del grupo no se puede eliminar: es quien puede volver a agregar integrantes.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (v_uid = v_creador OR public.is_group_admin(p_group_id, v_uid)) THEN
    RAISE EXCEPTION 'Solo el creador del grupo o un Administrador pueden eliminar integrantes.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.group_members
  WHERE group_id = p_group_id AND user_id = p_user_id;

  GET DIAGNOSTICS v_borradas = ROW_COUNT;
  RETURN v_borradas;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_group_member(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_group_member(UUID, UUID) TO authenticated;

-- ============================================
-- Cambiar el rol de un integrante (owner → admin → member)
-- ============================================
CREATE OR REPLACE FUNCTION public.set_group_member_role(
  p_group_id UUID,
  p_user_id UUID,
  p_role TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_creador UUID;
  v_rol     TEXT := lower(coalesce(p_role, ''));
  v_filas   INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa. Vuelve a iniciar sesión.'
      USING ERRCODE = '28000';
  END IF;

  IF v_rol NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'Rol no válido: %, usa "admin" o "member".', p_role
      USING ERRCODE = '22023';
  END IF;

  SELECT g.owner_id INTO v_creador FROM public.groups g WHERE g.id = p_group_id;
  IF v_creador IS NULL THEN
    RAISE EXCEPTION 'El grupo no existe o fue eliminado.'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_user_id = v_creador THEN
    RAISE EXCEPTION 'El creador del grupo no puede cambiar de rol.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (v_uid = v_creador OR public.is_group_admin(p_group_id, v_uid)) THEN
    RAISE EXCEPTION 'Solo el creador del grupo o un Administrador pueden cambiar el rol de un integrante.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.group_members
  SET role = v_rol
  WHERE group_id = p_group_id AND user_id = p_user_id;

  GET DIAGNOSTICS v_filas = ROW_COUNT;
  RETURN v_filas;
END;
$$;

REVOKE ALL ON FUNCTION public.set_group_member_role(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_group_member_role(UUID, UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================
-- Comprobaciones (SQL Editor corre como postgres y no aplica RLS)
-- ============================================
-- ¿Existen las funciones y las ve PostgREST?
--   SELECT proname, pg_get_function_arguments(oid) FROM pg_proc
--   WHERE proname IN ('remove_group_member', 'set_group_member_role');
--
-- ¿Cómo quedaron las políticas de la tabla? (esto explica el fallo del borrado
-- directo: si falta una política DELETE, el DELETE devuelve 0 filas SIN error)
--   SELECT polname, cmd, permissive, roles::text, qual::text
--   FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'group_members';
--
-- ¿Hay algún grupo cuyo creador no sea 'owner' en su fila de miembro?
--   SELECT g.id, g.name, g.owner_id, gm.role
--   FROM public.groups g
--   LEFT JOIN public.group_members gm
--     ON gm.group_id = g.id AND gm.user_id = g.owner_id
--   WHERE gm.role IS DISTINCT FROM 'owner';
