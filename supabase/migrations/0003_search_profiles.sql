-- ============================================
-- Búsqueda de usuarios para invitar a un grupo
-- ============================================
-- Permite que un usuario autenticado busque a otros por nombre o teléfono
-- (parcial y tolerante al formato: +51, espacios, guiones) SIN exponer el
-- resto de columnas de profiles (yape_number, bcp_account, bcp_cci, etc.).
--
-- Aplicar en Supabase Studio > SQL Editor, o con:
--   psql "$DATABASE_URL" -f supabase/migrations/0003_search_profiles.sql

CREATE OR REPLACE FUNCTION public.search_profiles(search TEXT, max_rows INT DEFAULT 20)
RETURNS TABLE (id UUID, phone TEXT, full_name TEXT, role TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.phone, p.full_name, p.role
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND search IS NOT NULL
    AND length(btrim(search)) >= 3
    AND (
      p.full_name ILIKE '%' || btrim(search) || '%'
      OR (
        length(regexp_replace(search, '\D', '', 'g')) >= 3
        AND regexp_replace(coalesce(p.phone, ''), '\D', '', 'g')
            LIKE '%' || regexp_replace(search, '\D', '', 'g') || '%'
      )
    )
  ORDER BY p.full_name NULLS LAST
  LIMIT greatest(1, least(coalesce(max_rows, 20), 50));
$$;

REVOKE ALL ON FUNCTION public.search_profiles(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_profiles(TEXT, INT) TO authenticated;

-- Forzar la recarga del cache de esquema de PostgREST para que exponga la
-- función como RPC (/rest/v1/rpc/search_profiles).
NOTIFY pgrst, 'reload schema';

-- Comprobación rápida (con una sesión autenticada desde la app o desde el SQL
-- Editor, que corre como postgres y por tanto ve todo):
--   SELECT * FROM public.search_profiles('987', 20);
--   SELECT count(*) FROM public.profiles;                       -- filas existentes
--   SELECT polname, cmd FROM pg_policies WHERE tablename = 'profiles';
