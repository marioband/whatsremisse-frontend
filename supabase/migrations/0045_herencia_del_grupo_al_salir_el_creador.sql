-- ============================================
-- 0045 · Salir del grupo siendo el creador: la propiedad se hereda
-- ============================================
-- Pedido del usuario (23-09-2026): «Si el propietario deja el grupo, la propiedad del grupo pasará al
-- primer admin nombrado, si no hay admin nombrado pasará al primer integrante registrado».
--
-- La 0043 dejó que un integrante o un administrador se fuera, pero al CREADOR no lo dejaba salir: su
-- grupo quedaba sin dueño y nadie podría volver a agregar gente. Aquí se cambia esa regla: el creador
-- sale y la propiedad PASA a otro antes de borrar su fila.
--
-- Quién hereda, en este orden:
--   1. el primer ADMIN nombrado —el administrador más antiguo en el grupo (`joined_at`; es el único
--      orden que existe, porque la base no guarda CUÁNDO se le nombró administrador—);
--   2. si no hay ninguno, el primer INTEGRANTE registrado (el más antiguo en el grupo);
--   3. si no hay nadie más (el creador está SOLO), NO se le deja salir: se le explica que elimine el
--      grupo. Es la única salida honesta: `groups.owner_id` no puede quedar en nadie.
--
-- Reemplaza `salir_del_grupo` (misma firma y mismos permisos que la 0043), así que la app NO cambia
-- una línea: la regla vive entera en la base. Se puede repetir sin daño.
-- ============================================

BEGIN;

CREATE OR REPLACE FUNCTION public.salir_del_grupo(p_group_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_creador  UUID;
  v_heredero UUID;
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

  -- El creador se va: hay que decidir quién queda al mando ANTES de borrar su fila.
  IF v_creador = v_uid THEN
    SELECT gm.user_id INTO v_heredero
      FROM public.group_members gm
     WHERE gm.group_id = p_group_id
       AND gm.user_id <> v_uid
       AND gm.role = 'admin'
     ORDER BY gm.joined_at ASC NULLS LAST, gm.user_id ASC
     LIMIT 1;

    IF v_heredero IS NULL THEN
      SELECT gm.user_id INTO v_heredero
        FROM public.group_members gm
       WHERE gm.group_id = p_group_id
         AND gm.user_id <> v_uid
       ORDER BY gm.joined_at ASC NULLS LAST, gm.user_id ASC
       LIMIT 1;
    END IF;

    IF v_heredero IS NULL THEN
      RAISE EXCEPTION 'Eres el único integrante del grupo: para dejarlo, elimina el grupo.'
        USING ERRCODE = '42501';
    END IF;

    UPDATE public.groups g SET owner_id = v_heredero WHERE g.id = p_group_id;
    -- El heredero manda de verdad: su fila queda como 'owner' (las políticas y `is_group_admin`
    -- miran ese rol, además de `groups.owner_id`).
    UPDATE public.group_members gm
       SET role = 'owner'
     WHERE gm.group_id = p_group_id
       AND gm.user_id = v_heredero;
  END IF;

  DELETE FROM public.group_members gm
   WHERE gm.group_id = p_group_id
     AND gm.user_id = v_uid;

  GET DIAGNOSTICS v_borradas = ROW_COUNT;
  RETURN v_borradas;
END;
$$;

COMMENT ON FUNCTION public.salir_del_grupo(UUID) IS
  'Saca al que llama de su grupo. Si es el creador, antes pasa la propiedad al administrador más '
  'antiguo o, si no hay, al integrante más antiguo; si está solo, se le impide salir.';

REVOKE ALL ON FUNCTION public.salir_del_grupo(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.salir_del_grupo(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
