-- ============================================
-- 0048 — Las cuentas son USUARIOS (fuera las categorías conductor/proveedor)
-- ============================================
-- Pedido del usuario (09-10-2026): «veo usuarios con roles asignados como conductor y proveedor,
-- no sé en qué momento sucedió eso; cualquier usuario puede ser conductor y/o proveedor, por eso
-- solo son usuarios, no hay categorización».
--
-- De dónde venía el rótulo: `handle_new_user()` (0001) creaba TODO perfil nuevo con role='DRIVER',
-- y las cuentas más viejas traían PROVIDER/GROUP_OWNER de la etapa en que la app separaba los dos
-- papeles. Hoy el papel lo decide cada servicio (quien publica es proveedor; quien postula es
-- conductor), no la cuenta.
--
-- Qué hace, en orden:
--   1) Todos los no administradores pasan a `role='USER'` (se conserva 'ADMIN', el único rol con
--      significado: es el que abre el panel).
--   2) El CHECK de la columna acepta ('USER','ADMIN') y la columna queda comentada.
--   3) `handle_new_user()` crea los perfiles nuevos como 'USER'.
--   4) `panel_cambiar_rol` queda como el interruptor del administrador: USER <-> ADMIN
--      (con el mismo candado del último administrador y el mismo registro de auditoría).
--
-- El candado de la 0046 (`protege_la_membresia`) no estorba a esta migración: deja pasar las
-- escrituras sin sesión (psql/migraciones) y las del panel.
--
-- Aplicar con (una línea, desde la carpeta `supabase`):
--   cat migrations/0048_panel_usuarios_sin_categorias.sql | docker exec -i supabase-db psql -U supabase_admin -d postgres

BEGIN;

-- ============================================
-- 1) El CHECK de la columna, primero (si no, el UPDATE choca con la regla vieja)
-- ============================================
-- Nombre por convención de Postgres para el CHECK en línea de la 0001: profiles_role_check.
-- Orden obligatorio: soltar la regla vieja, normalizar los datos, y recién entonces poner la
-- nueva (con la regla puesta, 'USER' no pasaría y con los datos viejos, la regla nueva no pasaría).
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- ============================================
-- 2) Los datos: fuera las categorías
-- ============================================
UPDATE public.profiles
   SET role = 'USER', updated_at = now()
 WHERE upper(coalesce(role, '')) <> 'ADMIN';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('USER', 'ADMIN'));

COMMENT ON COLUMN public.profiles.role IS
  'USER = cualquier cuenta; ADMIN = puede abrir el panel. Las cuentas no se categorizan: el papel (publicar/postular) lo decide cada servicio.';

-- ============================================
-- 3) Las cuentas nuevas nacen 'USER'
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, phone, role)
  VALUES (NEW.id, NEW.phone, 'USER')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4) El panel solo mueve el interruptor del administrador
-- ============================================
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
  IF v_rol NOT IN ('USER', 'ADMIN') THEN
    RAISE EXCEPTION 'Rol no valido: % (usa USER o ADMIN)', p_rol USING ERRCODE = '22023';
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

GRANT EXECUTE ON FUNCTION public.panel_cambiar_rol(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.panel_cambiar_rol(UUID, TEXT) FROM PUBLIC;

COMMIT;
