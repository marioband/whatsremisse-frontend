-- ============================================
-- 0005 — Datos de los integrantes de un grupo
-- ============================================
-- Síntoma que corrige:
--   1) En "Mis Grupos > integrantes" los nombres aparecían como UUID
--      (p. ej. 7c944bdf-a63f-4242-9b88-7aaee8a20ff0) en lugar del nombre.
--   2) Al abrir la ficha del integrante, "Datos del conductor" y
--      "Datos del Vehículo" salían vacíos.
--
-- Causa (verificada en las migraciones, no supuesta):
--   `0001_initial.sql` crea `profiles` con RLS y una sola política de lectura:
--     CREATE POLICY "Profiles own read" ON public.profiles FOR SELECT
--       USING (auth.uid() = id);
--   Es decir, cada usuario solo puede leer SU fila. Entonces:
--     - El embed `group_members?select=...,profiles(full_name)` devuelve NULL
--       para los demás integrantes y la app caía al `user_id` (el UUID).
--     - `select ... from profiles where id = <otro usuario>` devuelve 0 filas
--       SIN error (con `.single()` eso es un error PGRST116 que el código
--       convertía en "sin datos"), así que la ficha salía vacía.
--   `0002_groups_and_messages.sql` sí define
--   "Authenticated users read public profiles" (USING auth.uid() IS NOT NULL),
--   pero esa política no está aplicada en la base de datos (o fue reemplazada):
--   si lo estuviera, los nombres ya se verían.
--
-- Solución: dos funciones SECURITY DEFINER con alcance limitado. Devolúmenes
-- ÚNICAMENTE datos públicos —nombre, teléfono, rol y vehículo— y nunca
-- `yape_number`, `bcp_account` ni `bcp_cci`.
--   - group_member_profiles(grupo): solo si el que llama es integrante
--     (o dueño) de ese grupo.
--   - public_profile(usuario): solo para uno mismo, para alguien con quien se
--     comparte un grupo, o para la contraparte de un servicio (proveedor /
--     conductor asignado / postulante).
--
-- Aplicar en Supabase Studio > SQL Editor, o con:
--   psql "$DATABASE_URL" -f supabase/migrations/0005_group_member_profiles.sql

-- ============================================
-- Integrantes de un grupo, con nombre y datos del vehículo
-- ============================================
CREATE OR REPLACE FUNCTION public.group_member_profiles(p_group_id UUID)
RETURNS TABLE (
  user_id UUID,
  member_role TEXT,
  full_name TEXT,
  phone TEXT,
  profile_role TEXT,
  vehicle_data JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    gm.user_id,
    gm.role::text AS member_role,
    p.full_name,
    p.phone,
    p.role AS profile_role,
    p.vehicle_data
  FROM public.group_members gm
  LEFT JOIN public.profiles p ON p.id = gm.user_id
  WHERE gm.group_id = p_group_id
    AND auth.uid() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.group_members me
        WHERE me.group_id = p_group_id AND me.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.groups g
        WHERE g.id = p_group_id AND g.owner_id = auth.uid()
      )
    );
$$;

-- ============================================
-- Perfil público de un usuario concreto
-- ============================================
CREATE OR REPLACE FUNCTION public.public_profile(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  phone TEXT,
  profile_role TEXT,
  vehicle_data JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.full_name,
    p.phone,
    p.role AS profile_role,
    p.vehicle_data
  FROM public.profiles p
  WHERE p.id = p_user_id
    AND auth.uid() IS NOT NULL
    AND (
      -- Uno mismo (la app ya lo hace por consulta directa, pero así hay una
      -- sola vía cuando la política de lectura de profiles es restrictiva).
      p_user_id = auth.uid()
      -- Compartimos al menos un grupo.
      OR EXISTS (
        SELECT 1
        FROM public.group_members me
        JOIN public.group_members them ON them.group_id = me.group_id
        WHERE me.user_id = auth.uid() AND them.user_id = p_user_id
      )
      -- Soy el dueño de un grupo del que la otra persona es integrante.
      OR EXISTS (
        SELECT 1
        FROM public.groups g
        JOIN public.group_members m ON m.group_id = g.id
        WHERE g.owner_id = auth.uid() AND m.user_id = p_user_id
      )
      -- Servicios: proveedor <-> conductor asignado.
      OR EXISTS (
        SELECT 1 FROM public.service_alerts sa
        WHERE sa.provider_id = auth.uid() AND sa.assigned_driver_id = p_user_id
      )
      OR EXISTS (
        SELECT 1 FROM public.service_alerts sa
        WHERE sa.provider_id = p_user_id AND sa.assigned_driver_id = auth.uid()
      )
      -- Servicios: proveedor <-> conductor postulante.
      OR EXISTS (
        SELECT 1
        FROM public.applications a
        JOIN public.service_alerts sa ON sa.id = a.service_id
        WHERE a.driver_id = p_user_id AND sa.provider_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.applications a
        JOIN public.service_alerts sa ON sa.id = a.service_id
        WHERE a.driver_id = auth.uid() AND sa.provider_id = p_user_id
      )
    );
$$;

REVOKE ALL ON FUNCTION public.group_member_profiles(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_profile(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.group_member_profiles(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_profile(UUID) TO authenticated;

-- Exponer las funciones como RPC (/rest/v1/rpc/...) sin esperar el reinicio.
NOTIFY pgrst, 'reload schema';

-- ============================================
-- Comprobaciones (SQL Editor corre como postgres y por eso ve todo)
-- ============================================
-- ¿Existe la función y responde?
--   SELECT * FROM public.group_member_profiles('<uuid-del-grupo>');
--   SELECT * FROM public.public_profile('<uuid-del-usuario>');
--
-- ¿Las filas tienen realmente nombre y vehículo? (si aquí salen NULL, el
-- integrante todavía no completó su perfil en la app; no es un problema de
-- permisos y ninguna migración lo arregla):
--   SELECT id, phone, full_name, role, vehicle_data
--   FROM public.profiles ORDER BY created_at;
--
-- Políticas de lectura vigentes sobre profiles:
--   SELECT polname, cmd FROM pg_policies WHERE tablename = 'profiles';

-- ============================================
-- Recomendación de seguridad (NO aplicada aquí a propósito)
-- ============================================
-- La política "Authenticated users read public profiles" (0002) usa
-- USING (auth.uid() IS NOT NULL) sobre TODAS las columnas de `profiles`, lo que
-- expone `yape_number`, `bcp_account` y `bcp_cci` de cualquier usuario a
-- cualquier usuario autenticado. Con 0005 ya no hace falta para los flujos de
-- grupos, así que se puede endurecer. Aplicar SOLO después de confirmar que
-- ninguna pantalla dependa de la lectura directa de profiles ajenos:
--
--   DROP POLICY IF EXISTS "Authenticated users read public profiles" ON public.profiles;
--   CREATE POLICY "Profiles own read" ON public.profiles FOR SELECT
--     USING (auth.uid() = id);
