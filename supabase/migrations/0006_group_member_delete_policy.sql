-- ============================================
-- 0006 — Eliminar integrantes de un grupo (y cambiarles el rol)
-- ============================================
-- Síntoma que corrige:
--   * Se elimina un integrante, desaparece de la lista... y al recargar la
--     página vuelve a aparecer.
--   * Lo mismo con "Asignar Administrador": la app dice "Rol actualizado" pero
--     el rol no cambia en la base.
--
-- Causa: con RLS, un DELETE (o un UPDATE) que no toca ninguna fila NO es un
-- error. PostgREST responde 204 y el cliente cree que hizo el cambio; la
-- pantalla lo quita de la lista, pero la fila sigue en la base y reaparece al
-- recargar. El DELETE se queda en 0 filas cuando el USING de la política no se
-- cumple:
--   - `is_group_admin(...)` exige tener FILA en group_members con rol
--     owner/admin. El creador del grupo cuenta como owner en la app
--     (`groups.owner_id`), y si su fila de miembro falta o dice 'member', la
--     política rechaza el borrado aunque la app le muestre la opción.
--     La política de INSERT ya tenía esa salida (`groups.owner_id = auth.uid()`);
--     la de DELETE y la de UPDATE no.
--
-- Esta migración:
--   1) repone la invariante "el creador del grupo es owner" en los datos;
--   2) deja borrar/cambiar rol al creador del grupo aunque su fila falte o esté
--      mal, igual que ya se podía agregar integrantes;
--   3) protege en la base al creador: nadie puede borrar su fila ni degradarlo.
--
-- Todo es idempotente: se puede volver a ejecutar sin efectos nuevos.
-- Aplicar en Supabase Studio > SQL Editor, o con:
--   psql "$DATABASE_URL" -f supabase/migrations/0006_group_member_delete_policy.sql

-- ============================================
-- 0) Reparación de datos: el creador del grupo es 'owner' y tiene su fila
-- ============================================
-- Sin esto, un grupo creado antes de las políticas actuales puede tener al
-- creador sin fila o con rol 'member', y la app le muestra acciones que la base
-- rechaza en silencio.
INSERT INTO public.group_members (group_id, user_id, role)
SELECT g.id, g.owner_id, 'owner'
FROM public.groups g
WHERE NOT EXISTS (
  SELECT 1 FROM public.group_members gm
  WHERE gm.group_id = g.id AND gm.user_id = g.owner_id
);

UPDATE public.group_members gm
SET role = 'owner'
FROM public.groups g
WHERE g.id = gm.group_id
  AND g.owner_id = gm.user_id
  AND gm.role <> 'owner';

-- ============================================
-- 1) Funciones auxiliares SECURITY DEFINER
-- ============================================
-- Se redefinen aquí (son CREATE OR REPLACE, idempotentes) para que la 0006 se
-- pueda aplicar sola, sin depender de que la 0004 ya esté puesta: dentro de una
-- función SECURITY DEFINER no se aplica RLS, y por eso no hay recursión.
CREATE OR REPLACE FUNCTION public.is_group_member(gid UUID, uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = gid AND user_id = uid
  );
$$;

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

REVOKE ALL ON FUNCTION public.is_group_member(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_group_admin(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_group_owner(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_group_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_admin(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_owner(UUID, UUID) TO authenticated;

-- ============================================
-- 2) DELETE: creador o admin pueden borrar, salvo la fila del creador
-- ============================================
DROP POLICY IF EXISTS "Owners and admins delete members" ON public.group_members;
CREATE POLICY "Owners and admins delete members"
  ON public.group_members FOR DELETE
  USING (
    (
      public.is_group_admin(group_members.group_id, auth.uid())
      OR public.is_group_owner(group_members.group_id, auth.uid())
    )
    -- Nadie elimina al creador del grupo: es quien puede volver a agregar gente.
    AND NOT public.is_group_owner(group_members.group_id, group_members.user_id)
  );

-- ============================================
-- 3) UPDATE (rol / favorito): mismo permiso, y el creador no se degrada
-- ============================================
DROP POLICY IF EXISTS "Owners and admins manage members" ON public.group_members;
CREATE POLICY "Owners and admins manage members"
  ON public.group_members FOR UPDATE
  USING (
    public.is_group_admin(group_members.group_id, auth.uid())
    OR public.is_group_owner(group_members.group_id, auth.uid())
  )
  WITH CHECK (
    (
      public.is_group_admin(group_members.group_id, auth.uid())
      OR public.is_group_owner(group_members.group_id, auth.uid())
    )
    -- Si la fila es del creador, debe seguir siendo 'owner' (si no, el grupo se
    -- queda sin quien pueda agregar integrantes).
    AND (
      NOT public.is_group_owner(group_members.group_id, group_members.user_id)
      OR group_members.role = 'owner'
    )
  );

-- ============================================
-- 4) INSERT sin recursión (reafirma el de la 0004)
-- ============================================
-- Las políticas de la 0002 consultan group_members dentro de una política de
-- group_members: Postgres entra en recursión ("infinite recursion detected in
-- policy for relation \"group_members\"") y el alta falla. Por eso se usa
-- is_group_admin / is_group_owner, que son SECURITY DEFINER y no vuelven a
-- aplicar RLS. Ojo: NO se permite `auth.uid() = user_id` a secas, porque eso
-- dejaría a cualquiera agregarse solo a cualquier grupo conociendo su id.
DROP POLICY IF EXISTS "Group owners add initial member" ON public.group_members;
DROP POLICY IF EXISTS "Owners and admins add members" ON public.group_members;
CREATE POLICY "Owners and admins add members"
  ON public.group_members FOR INSERT
  WITH CHECK (
    public.is_group_admin(group_members.group_id, auth.uid())
    OR public.is_group_owner(group_members.group_id, auth.uid())
  );

NOTIFY pgrst, 'reload schema';

-- ============================================
-- Comprobaciones (SQL Editor corre como postgres y no aplica RLS)
-- ============================================
-- ¿Quedó algún grupo cuyo creador no sea 'owner'?
--   SELECT g.id, g.name, g.owner_id, gm.role
--   FROM public.groups g
--   LEFT JOIN public.group_members gm
--     ON gm.group_id = g.id AND gm.user_id = g.owner_id
--   WHERE gm.role IS DISTINCT FROM 'owner';
--
-- Integrantes de un grupo concreto:
--   SELECT gm.user_id, gm.role, p.full_name
--   FROM public.group_members gm
--   LEFT JOIN public.profiles p ON p.id = gm.user_id
--   WHERE gm.group_id = '<uuid-del-grupo>';
--
-- Políticas vigentes sobre group_members:
--   SELECT polname, cmd, qual, with_check FROM pg_policies
--   WHERE tablename = 'group_members';
