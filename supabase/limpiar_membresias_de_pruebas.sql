-- ============================================
-- Limpiar las membresías de la etapa de pruebas (09-10-2026)
-- ============================================
-- Pedido del usuario: los estados son TRES — **Activa, Inactiva, Promocional** — y los asigna él
-- desde el panel. Antes quedaron en la base cuentas «premium sin fecha» que la app marcó sola
-- (misma familia que el rol DRIVER) y cuentas premium con fecha ya pasada: todas esas vuelven a
-- Inactiva (tier FREE, sin fecha). Las membresías ACTIVAS (con fecha futura) se quedan intactas.
--
-- Se ejecuta UNA vez y deja su marca: si se vuelve a correr, avisa y no toca nada — así no borra
-- las Promocionales que el usuario asigne DESPUÉS con el panel.
--
-- Aplicar (una línea, desde la carpeta `supabase`):
--   cat limpiar_membresias_de_pruebas.sql | docker exec -i supabase-db psql -U supabase_admin -d postgres

BEGIN;

-- La marca de «esto ya se hizo» (una tabla diminuta; solo la ve el dueño de la base).
CREATE TABLE IF NOT EXISTS public.plataforma_marcas (
  clave TEXT PRIMARY KEY,
  hecho_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.plataforma_marcas ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.plataforma_marcas FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.plataforma_marcas FROM anon;
  END IF;
END $$;

DO $$
DECLARE
  v_marca BOOLEAN;
  v_promos INT := 0;
  v_vencidas INT := 0;
  v_sin_estado INT := 0;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.plataforma_marcas WHERE clave = 'limpieza_membresias_2026_10'
  ) INTO v_marca;
  IF v_marca THEN
    RAISE NOTICE 'La limpieza de membresías ya se había ejecutado (09-10-2026): no se toca nada.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_promos FROM public.profiles
   WHERE upper(coalesce(tier, '')) = 'PREMIUM' AND subscription_expires_at IS NULL;
  SELECT count(*) INTO v_vencidas FROM public.profiles
   WHERE upper(coalesce(tier, '')) = 'PREMIUM'
     AND subscription_expires_at IS NOT NULL AND subscription_expires_at < now();

  -- 1) Las «premium sin fecha» que marcó la app sola → Inactiva.
  UPDATE public.profiles
     SET tier = 'FREE', subscription_expires_at = NULL, updated_at = now()
   WHERE upper(coalesce(tier, '')) = 'PREMIUM' AND subscription_expires_at IS NULL;

  -- 2) Las vencidas → Inactiva (con el panel vuelven a activarse y se les pone fecha nueva).
  UPDATE public.profiles
     SET tier = 'FREE', subscription_expires_at = NULL, updated_at = now()
   WHERE upper(coalesce(tier, '')) = 'PREMIUM'
     AND subscription_expires_at IS NOT NULL AND subscription_expires_at < now();

  INSERT INTO public.plataforma_marcas (clave) VALUES ('limpieza_membresias_2026_10')
  ON CONFLICT (clave) DO NOTHING;

  RAISE NOTICE 'Listo: % promocionales de pruebas y % vencidas volvieron a Inactiva.',
    v_promos, v_vencidas;
END $$;

-- El estado final, para leerlo de un vistazo: cuántas hay en cada estado y cuántas con fecha.
SELECT
  coalesce(upper(tier), '(sin estado)') AS estado,
  count(*) AS cuentas,
  count(*) FILTER (WHERE subscription_expires_at IS NOT NULL) AS con_fecha,
  count(*) FILTER (WHERE subscription_expires_at IS NOT NULL AND subscription_expires_at > now()) AS vigentes
FROM public.profiles
GROUP BY 1
ORDER BY 2 DESC;

COMMIT;
