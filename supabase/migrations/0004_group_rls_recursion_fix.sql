-- ============================================
-- RLS de grupos sin recursión (aplicar solo si el error lo pide)
-- ============================================
-- Síntoma que arregla:
--   * "infinite recursion detected in policy for relation \"group_members\""
--   * "new row violates row-level security policy for table \"group_members\""
--   al agregar un integrante (Mis Grupos > grupo > + > Añadir participante).
--
-- Por qué pasa: las políticas de `group_members` se consultan a sí mismas en el
-- USING / WITH CHECK (la 0002 usa un EXISTS sobre group_members dentro de una
-- política de group_members). Postgres vuelve a aplicar la política de esa misma
-- tabla dentro de la subconsulta y entra en recursión (o la fila nueva no pasa
-- el WITH CHECK).
--
-- Solución: mover las comprobaciones a funciones SECURITY DEFINER (dentro de la
-- función no se aplica RLS) y usarlas desde las políticas.
--
-- Aplicar en Supabase Studio > SQL Editor (o con psql -f).

-- ============================================
-- Funciones auxiliares
-- ============================================
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

REVOKE ALL ON FUNCTION public.is_group_member(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_group_admin(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_group_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_admin(UUID, UUID) TO authenticated;

-- ============================================
-- groups
-- ============================================
DROP POLICY IF EXISTS "Members read own groups" ON public.groups;
CREATE POLICY "Members read own groups"
  ON public.groups FOR SELECT
  USING (auth.uid() = owner_id OR public.is_group_member(groups.id, auth.uid()));

-- ============================================
-- group_members
-- ============================================
DROP POLICY IF EXISTS "Members read group members" ON public.group_members;
CREATE POLICY "Members read group members"
  ON public.group_members FOR SELECT
  USING (auth.uid() = user_id OR public.is_group_member(group_members.group_id, auth.uid()));

-- El owner del grupo puede dar de alta integrantes aunque su propia fila de
-- miembro faltara (groups.owner_id no depende de group_members).
DROP POLICY IF EXISTS "Owners and admins add members" ON public.group_members;
CREATE POLICY "Owners and admins add members"
  ON public.group_members FOR INSERT
  WITH CHECK (
    public.is_group_admin(group_members.group_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_members.group_id AND g.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners and admins manage members" ON public.group_members;
CREATE POLICY "Owners and admins manage members"
  ON public.group_members FOR UPDATE
  USING (public.is_group_admin(group_members.group_id, auth.uid()))
  WITH CHECK (public.is_group_admin(group_members.group_id, auth.uid()));

DROP POLICY IF EXISTS "Owners and admins delete members" ON public.group_members;
CREATE POLICY "Owners and admins delete members"
  ON public.group_members FOR DELETE
  USING (public.is_group_admin(group_members.group_id, auth.uid()));

-- ============================================
-- messages
-- ============================================
DROP POLICY IF EXISTS "Members read messages" ON public.messages;
CREATE POLICY "Members read messages"
  ON public.messages FOR SELECT
  USING (public.is_group_member(messages.group_id, auth.uid()));

DROP POLICY IF EXISTS "Members send messages" ON public.messages;
CREATE POLICY "Members send messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND public.is_group_member(messages.group_id, auth.uid())
  );

-- Comprobaciones rápidas en el SQL Editor (corre como postgres, no aplica RLS):
--   SELECT count(*) FROM public.group_members;                    -- filas existentes
--   SELECT gm.group_id, gm.user_id, gm.role FROM public.group_members gm ORDER BY gm.joined_at DESC LIMIT 20;
--   SELECT g.id, g.name, g.owner_id FROM public.groups g ORDER BY g.created_at DESC LIMIT 5;

NOTIFY pgrst, 'reload schema';
