-- ============================================
-- 0052_panel_marca_lectura.sql
-- ============================================
-- 10-10-2026, pedido del usuario: en la FICHA de cada usuario del panel de administración se
-- selecciona quién tiene «Compartir viaje» y se personaliza su enlace (nombre, colores y logo).
-- Lo que escribía ya existía (`panel_marca_del_seguimiento`, 0049); lo que faltaba era PODER LEER
-- la marca de una cuenta para pintar la ficha: `panel_marca_de_usuario`.
--
-- Aplicar con (una sola línea, desde la carpeta supabase):
--   cat 0052_panel_marca_lectura.sql | docker exec -i supabase-db psql -U supabase_admin -d postgres

BEGIN;

CREATE OR REPLACE FUNCTION public.panel_marca_de_usuario(p_usuario UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin UUID := public.panel_exige_admin();
  v_marca RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_usuario) THEN
    RAISE EXCEPTION 'Esa cuenta no existe' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_marca FROM public.marcas_del_seguimiento m WHERE m.profile_id = p_usuario;

  RETURN jsonb_build_object(
    'activo', coalesce(v_marca.activo, false),
    'nombre', v_marca.nombre,
    'color_principal', coalesce(v_marca.color_principal, '#2D2D2D'),
    'color_secundario', coalesce(v_marca.color_secundario, '#9AA0A6'),
    'logo_url', v_marca.logo_url,
    'tiene_marca', v_marca.profile_id IS NOT NULL
  );
END;
$$;
COMMENT ON FUNCTION public.panel_marca_de_usuario(UUID) IS
  'La marca del seguimiento de una cuenta (para la ficha del panel): activo, nombre, colores y logo.';

REVOKE ALL ON FUNCTION public.panel_marca_de_usuario(UUID) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.panel_marca_de_usuario(UUID) TO authenticated;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
