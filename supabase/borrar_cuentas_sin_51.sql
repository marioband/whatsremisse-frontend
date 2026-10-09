-- ============================================
-- Borrar las cuentas SIN +51, con todo lo suyo (09-10-2026)
-- ============================================
-- Pedido del usuario: «los que no tenían el +51 deberían ser eliminados junto con los servicios
-- creados y los grupos creados, como si nunca hubieran existido» (para evitar duplicación).
--
-- Qué hace, por cada cuenta cuyo teléfono no empieza por `+51` (incluidas las que no tienen
-- teléfono: esas no pueden entrar, porque el teléfono es el usuario y la contraseña):
--   1) Imprime el repaso: servicios, postulaciones, mensajes, grupos propios y grupos como integrante.
--   2) Guarda su ficha en `public.cuentas_borradas_sin_51` (solo la lee el dueño de la base).
--   3) Borra TODO lo suyo: sus mensajes, sus servicios (con ellos caen sus postulaciones y los
--      mensajes de esos servicios), sus grupos (con sus integrantes e invitaciones) y su cuenta de
--      acceso (con el perfil y todo lo demás, en cascada).
--   4) NUNCA borra una cuenta con role = 'ADMIN': se conserva y lo avisa. Sin eso se podría borrar
--      la única cuenta que entra al panel.
-- Se puede correr varias veces: la segunda vez ya no queda ninguna.
--
-- Antes de borrar, para ver la lista sin tocar nada: `revisar_cuentas_sin_51.sql`.
-- Correr (una línea, desde la carpeta `supabase`):
--   cat borrar_cuentas_sin_51.sql | docker exec -i supabase-db psql -U supabase_admin -d postgres

BEGIN;

-- ============================================
-- La copia de lo que se borre (para saber quién fue, no para devolverlo)
-- ============================================
CREATE TABLE IF NOT EXISTS public.cuentas_borradas_sin_51 (
  id UUID PRIMARY KEY,
  phone TEXT,
  role TEXT,
  full_name TEXT,
  creada_at TIMESTAMPTZ,
  tenia_servicios INT NOT NULL DEFAULT 0,
  tenia_postulaciones INT NOT NULL DEFAULT 0,
  tenia_mensajes INT NOT NULL DEFAULT 0,
  borrado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cuentas_borradas_sin_51
  ADD COLUMN IF NOT EXISTS tenia_grupos_propios INT NOT NULL DEFAULT 0;
ALTER TABLE public.cuentas_borradas_sin_51
  ADD COLUMN IF NOT EXISTS tenia_grupos_integrante INT NOT NULL DEFAULT 0;

-- Nadie la lee por la API: solo el dueño de la base (lleva teléfonos de personas).
ALTER TABLE public.cuentas_borradas_sin_51 ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.cuentas_borradas_sin_51 FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.cuentas_borradas_sin_51 FROM anon;
  END IF;
END $$;

-- ============================================
-- El borrado (imprime cada decisión)
-- ============================================
DO $$
DECLARE
  r RECORD;
  v_borradas INT := 0;
  v_admin INT := 0;
  v_problemas INT := 0;
BEGIN
  FOR r IN
    SELECT
      p.id,
      p.phone,
      p.role,
      p.full_name,
      p.created_at,
      (SELECT count(*) FROM public.service_alerts sa WHERE sa.provider_id = p.id) AS servicios,
      (SELECT count(*) FROM public.applications a WHERE a.driver_id = p.id) AS postulaciones,
      (SELECT count(*) FROM public.messages m WHERE m.sender_id = p.id) AS mensajes,
      (SELECT count(*) FROM public.groups g WHERE g.owner_id = p.id) AS grupos_propios,
      (SELECT count(*) FROM public.group_members gm JOIN public.groups g ON g.id = gm.group_id
        WHERE gm.user_id = p.id AND g.owner_id <> p.id) AS grupos_integrante
    FROM public.profiles p
    WHERE p.phone IS NULL OR p.phone NOT LIKE '+51%'
    ORDER BY p.phone NULLS FIRST, p.created_at
  LOOP
    IF upper(coalesce(r.role, '')) = 'ADMIN' THEN
      RAISE NOTICE 'SE CONSERVA % | es ADMINISTRADOR: una cuenta del panel no se borra nunca',
        coalesce(r.phone, '(SIN TELEFONO)');
      v_admin := v_admin + 1;
      CONTINUE;
    END IF;

    RAISE NOTICE 'BORRANDO % | % servicio(s), % postulacion(es), % mensaje(s), % grupo(s) propios, % grupo(s) como integrante',
      coalesce(r.phone, '(SIN TELEFONO)'), r.servicios, r.postulaciones, r.mensajes,
      r.grupos_propios, r.grupos_integrante;

    INSERT INTO public.cuentas_borradas_sin_51
      (id, phone, role, full_name, creada_at, tenia_servicios, tenia_postulaciones, tenia_mensajes,
       tenia_grupos_propios, tenia_grupos_integrante)
    VALUES (r.id, r.phone, r.role, r.full_name, r.created_at, r.servicios, r.postulaciones,
            r.mensajes, r.grupos_propios, r.grupos_integrante)
    ON CONFLICT (id) DO NOTHING;

    BEGIN
      -- Lo suyo, de lo más nuevo a lo más viejo. Lo demás cae en cascada con la cuenta.
      DELETE FROM public.messages WHERE sender_id = r.id;
      DELETE FROM public.service_alerts WHERE provider_id = r.id;  -- con ellos: postulaciones y sus mensajes
      DELETE FROM public.groups WHERE owner_id = r.id;             -- con ellos: integrantes e invitaciones
      DELETE FROM auth.users WHERE id = r.id;                      -- con ella: el perfil y todo lo demás
      v_borradas := v_borradas + 1;
    EXCEPTION
      WHEN foreign_key_violation THEN
        RAISE NOTICE '  ... no se pudo terminar de borrar %: algo lo tiene enganchado sin cascada',
          coalesce(r.phone, '(SIN TELEFONO)');
        v_problemas := v_problemas + 1;
    END;
  END LOOP;

  RAISE NOTICE 'RESUMEN: % borradas, % conservadas (administradores), % con problema',
    v_borradas, v_admin, v_problemas;
END $$;

-- ============================================
-- Quién quedó (para leerlo de un vistazo): todas con +51
-- ============================================
SELECT
  coalesce(phone, '(SIN TELEFONO)') AS telefono,
  role AS rol,
  created_at::date AS creada,
  count(*) OVER () AS cuentas_totales
FROM public.profiles
ORDER BY created_at;

COMMIT;
