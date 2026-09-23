-- ============================================
-- 0043 · Salir de un grupo (un integrante se va por su cuenta)
-- ============================================
-- Pedido del usuario (22-09-2026): «¿cómo un usuario puede salir del grupo al que lo agregaron?».
--
-- Hasta ahora solo el creador o un administrador podían SACAR a otro (0006 y 0007); un integrante no
-- tenía ninguna forma de irse. Esta migración añade las dos vías con la MISMA regla:
--
--   * un integrante (o un administrador) borra SU fila de `group_members`;
--   * el CREADOR no puede salir: su grupo quedaría sin dueño y nadie podría volver a agregar gente.
--     Para él sigue estando «Eliminar grupo».
--
-- Qué NO cambia: el grupo, sus mensajes y los servicios compartidos a él se quedan como están (solo
-- se va la fila de quien sale). Los avisos dejan de llegarle porque los destinatarios se calculan
-- desde `group_members`.
--
-- Se aplica con el rol DUEÑO (`supabase_admin`), como las demás. Se puede repetir sin daño.
--
-- ============================================
-- OJO: LO QUE ESTA MIGRACIÓN NECESITA (comprobado en producción el 22-09-2026)
-- ============================================
-- La primera versión de este archivo usaba la función `public.is_group_owner`, que la 0006 debería
-- haber creado… y en producción NO existe:
--
--     ERROR:  function public.is_group_owner(uuid, uuid) does not exist
--
-- (en esa base sí están `is_group_admin`, `remove_group_member` y `set_group_member_role`, pero el
-- resto de la 0006 no). Lección, la misma de la 0042: **una migración no puede dar por hecho que
-- las anteriores se aplicaron**. Así que aquí la 0006 se trae lo que necesita: crea
-- `is_group_owner` si falta (mismo cuerpo que la 0006, `CREATE OR REPLACE` = no rompe nada si ya
-- estuviera) y la política la usa.
--
-- ¿Por qué una función y no un subconsulta contra `groups`? Porque las políticas de `groups`
-- consultan `group_members` (0002/0004): hacerlo al revés dentro de la política de `group_members`
-- es la receta de «infinite recursion detected in policy». Una función SECURITY DEFINER no pasa por
-- el RLS de dentro y evita ese círculo.
-- ============================================

BEGIN;

-- ============================================
-- 0) Lo que hace falta de la 0006, por si no está
-- ============================================
CREATE OR REPLACE FUNCTION public.is_group_owner(gid UUID, uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = gid AND g.owner_id = uid
  );
$$;

REVOKE ALL ON FUNCTION public.is_group_owner(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_group_owner(UUID, UUID) TO authenticated;

-- ============================================
-- 1) La función que usa la app: salir_del_grupo
-- ============================================
-- Va por función (y no por UPDATE/DELETE directo) por el mismo motivo que `remove_group_member`
-- (0007): así la regla vive en la base, el mensaje de error es claro y no depende de las políticas
-- de la tabla. Solo puede tocar la fila de quien llama: `p_user_id` no existe como parámetro.
CREATE OR REPLACE FUNCTION public.salir_del_grupo(p_group_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_creador  UUID;
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

  IF v_uid = v_creador THEN
    RAISE EXCEPTION 'El creador del grupo no puede salir: puede eliminar el grupo.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.group_members gm
   WHERE gm.group_id = p_group_id
     AND gm.user_id = v_uid;

  GET DIAGNOSTICS v_borradas = ROW_COUNT;
  RETURN v_borradas;
END;
$$;

REVOKE ALL ON FUNCTION public.salir_del_grupo(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.salir_del_grupo(UUID) TO authenticated;

-- ============================================
-- 2) La misma regla para el borrado directo (respaldo del cliente)
-- ============================================
-- La app usa el DELETE directo si la función todavía no está instalada. Sin esta política, ese
-- DELETE responde OK sin borrar nada y el integrante reaparece al recargar la lista.
DROP POLICY IF EXISTS "Members can leave" ON public.group_members;
CREATE POLICY "Members can leave"
  ON public.group_members FOR DELETE
  USING (
    group_members.user_id = auth.uid()
    AND NOT public.is_group_owner(group_members.group_id, auth.uid())
  );

-- ============================================
-- 3) Comprobaciones (a mano, si se quiere)
-- ============================================
-- ¿Quién queda en el grupo y con qué rol? (poner el id del grupo)
--   SELECT gm.user_id, gm.role, p.phone FROM public.group_members gm
--     LEFT JOIN public.profiles p ON p.id = gm.user_id WHERE gm.group_id = '...';
-- ¿Quedó la política nueva?
--   SELECT polname, cmd, qual::text FROM pg_policies WHERE tablename = 'group_members';

NOTIFY pgrst, 'reload schema';

COMMIT;
