-- ============================================
-- 0023: el favorito de un grupo lo escribe SU integrante
-- ============================================
-- Síntoma que arregla (18-09-2026): en «Mis grupos», tocar el corazón de un grupo
-- **no hacía nada**. El corazón se rellenaba un instante y volvía a su estado.
--
-- Por qué pasa: `favorite` vive en `group_members`, y la única política de UPDATE de
-- esa tabla (0006, "Owners and admins manage members") exige
-- `is_group_admin(...) OR is_group_owner(...)`. Un integrante NORMAL no puede
-- actualizar ni su propia fila: el UPDATE no toca ninguna fila, PostgREST responde
-- 204 sin error y el cliente (que sí comprueba las filas, regla del proyecto) lo
-- detecta y revierte el cambio optimista.
--
-- El favorito es un dato PERSONAL (mi preferencia de orden en mi lista), así que no
-- puede depender de ser administrador: se escribe con esta función SECURITY DEFINER,
-- que solo puede tocar la columna `favorite` y SOLO la fila de quien llama. No permite
-- cambiar `role` (eso sigue siendo cosa de `set_group_member_role`, migración 0007).
--
-- Aplicar desde el terminal del VPS con el rol DUEÑO de las tablas (no con `-U postgres`:
-- no es dueño y ALTER/CREATE OR REPLACE de funciones que usan sus tablas falla).

CREATE OR REPLACE FUNCTION public.marcar_grupo_favorito(
  p_group_id UUID,
  p_favorito BOOLEAN
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  filas INTEGER;
BEGIN
  -- Solo la fila del que llama (`auth.uid()`): sin sesión, auth.uid() es NULL y el
  -- UPDATE no toca nada, así que un anónimo recibe 0.
  UPDATE public.group_members
     SET favorite = COALESCE(p_favorito, false)
   WHERE group_id = p_group_id
     AND user_id = auth.uid();

  GET DIAGNOSTICS filas = ROW_COUNT;
  RETURN filas;
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_grupo_favorito(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marcar_grupo_favorito(UUID, BOOLEAN) TO authenticated;

-- La fila que escribe la función se lee con la política de SELECT que ya existe
-- ("Members read group members", 0004): el integrante ve su propia fila.
NOTIFY pgrst, 'reload schema';
