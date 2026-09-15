-- ============================================
-- 0008 — Membresía premium
-- ============================================
-- La app ya tiene el tipo `tier` ('FREE' | 'PREMIUM') y
-- `subscription_expires_at`, pero la tabla `profiles` no tenía esas columnas:
-- el perfil las inventaba en el cliente (siempre PREMIUM), así que no se podía
-- activar ni desactivar nada de verdad.
--
-- Qué hace esta migración:
--   1) añade `tier` y `subscription_expires_at` a `profiles`;
--   2) deja a TODAS las cuentas existentes con premium activo (etapa de pruebas:
--      todavía no existe el panel de administración);
--   3) permite que un administrador (profiles.role = 'ADMIN') active o desactive
--      la membresía de cualquier usuario, que es lo que usará el panel cuando
--      se construya.
--
-- `subscription_expires_at` en NULL = sin vencimiento.
-- Idempotente: se puede volver a ejecutar sin efectos nuevos.
--
-- Aplicar en Supabase Studio > SQL Editor, o con:
--   psql "$DATABASE_URL" -f supabase/migrations/0008_premium.sql

-- ============================================
-- 1) Columnas
-- ============================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'PREMIUM';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_tier_check' AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_tier_check CHECK (tier IN ('FREE', 'PREMIUM'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_profiles_tier ON public.profiles(tier);

-- ============================================
-- 2) Etapa de pruebas: todos premium
-- ============================================
-- (Sin esto, las cuentas creadas antes de la migración quedarían con el valor
-- por defecto, que ya es PREMIUM; se deja explícito para que quede claro.)
UPDATE public.profiles SET tier = 'PREMIUM' WHERE tier IS NULL OR tier = '';

-- ============================================
-- 3) El administrador puede cambiar la membresía de cualquiera
-- ============================================
-- El cliente solo puede actualizar su propia fila ("Profiles own update"), así
-- que el panel de administración necesita esta política. Quién es administrador
-- se decide con `profiles.role = 'ADMIN'`, que es el rol que ya usa la app.
CREATE OR REPLACE FUNCTION public.is_app_admin(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = uid AND p.role = 'ADMIN'
  );
$$;

REVOKE ALL ON FUNCTION public.is_app_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_app_admin(UUID) TO authenticated;

DROP POLICY IF EXISTS "Admins manage memberships" ON public.profiles;
CREATE POLICY "Admins manage memberships"
  ON public.profiles FOR UPDATE
  USING (public.is_app_admin(auth.uid()))
  WITH CHECK (public.is_app_admin(auth.uid()));

-- ============================================
-- 4) Cómo se activa una membresía (lo que hará el panel)
-- ============================================
-- Desde el SQL Editor (corre como postgres y no aplica RLS):
--
--   -- premium 30 días
--   UPDATE public.profiles
--   SET tier = 'PREMIUM', subscription_expires_at = now() + interval '30 days'
--   WHERE phone = '987654321';
--
--   -- premium sin vencimiento
--   UPDATE public.profiles
--   SET tier = 'PREMIUM', subscription_expires_at = NULL
--   WHERE phone = '987654321';
--
--   -- quitar premium
--   UPDATE public.profiles SET tier = 'FREE' WHERE phone = '987654321';
--
--   -- ver el estado de todos
--   SELECT id, phone, full_name, role, tier, subscription_expires_at FROM public.profiles ORDER BY created_at;
--
-- Desde el panel (cliente), con la política de arriba:
--   supabase.from('profiles').update({ tier, subscription_expires_at }).eq('id', userId)

-- ============================================
-- Comprobaciones
-- ============================================
-- ¿Todas las cuentas quedaron premium?
--   SELECT tier, count(*) FROM public.profiles GROUP BY tier;
--
-- ¿Quién es administrador hoy? (para entrar al panel)
--   SELECT id, phone, full_name FROM public.profiles WHERE role = 'ADMIN';
--
-- Políticas sobre profiles:
--   SELECT polname, cmd, qual::text FROM pg_policies WHERE tablename = 'profiles';

NOTIFY pgrst, 'reload schema';
