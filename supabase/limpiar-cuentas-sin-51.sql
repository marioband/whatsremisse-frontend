-- ============================================
-- Limpiar las cuentas SIN +51 (los números de la etapa de pruebas)
-- ============================================
-- Pedido del usuario (25-09-2026): «borra los que no tienen +51; todos los números creados antes
-- del +51 han sido de pruebas».
--
-- QUÉ HACE, y en este orden:
--   1) Repasa TODAS las cuentas cuyo teléfono no empieza por `+51` (incluidas las que no tienen
--      teléfono: esas no pueden entrar, porque el teléfono es el usuario y la contraseña).
--   2) A cada una le cuenta lo que tiene dentro: servicios publicados, postulaciones, mensajes,
--      grupos que posee y grupos en los que está como integrante.
--   3) **Borra SOLO las que no tienen nada de eso.** Las que tengan cualquier dato se CONSERVAN y
--      se imprimen con sus números, para que nadie borre a un usuario real sin verlo antes.
--   4) Guarda una copia del perfil de cada cuenta borrada en `public.cuentas_borradas_sin_51`
--      (solo la lee el dueño de la base: no tiene políticas, así que la API no la ve).
--
-- Lo que NO se puede deshacer: el borrado. La copia sirve para saber QUIÉN se borró, no para
-- devolverle su cuenta (su acceso vive en `auth.users`, que se va con ella).
--
-- Aplicar con (una línea, desde la carpeta `supabase`):
--   cat limpiar-cuentas-sin-51.sql | docker exec -i supabase-db psql -U supabase_admin -d postgres
--
-- Se puede volver a ejecutar: la segunda vez ya no queda ninguna cuenta sin +51 vacía.

BEGIN;

-- ============================================
-- La copia de lo que se borre
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
-- El repaso (imprime cada decisión y solo borra lo que está vacío)
-- ============================================
DO $$
DECLARE
  r RECORD;
  v_borradas INT := 0;
  v_conservadas INT := 0;
  v_sin_telefono_borradas INT := 0;
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
      (SELECT count(*) FROM public.group_members gm WHERE gm.user_id = p.id) AS grupos_integrante
    FROM public.profiles p
    WHERE p.phone IS NULL OR p.phone NOT LIKE '+51%'
    ORDER BY p.phone NULLS FIRST, p.created_at
  LOOP
    IF (r.servicios + r.postulaciones + r.mensajes + r.grupos_propios + r.grupos_integrante) > 0 THEN
      RAISE NOTICE 'SE CONSERVA % | rol % | tiene: % servicios, % postulaciones, % mensajes, % grupos propios, % como integrante',
        coalesce(r.phone, '(SIN TELEFONO)'), r.role, r.servicios, r.postulaciones, r.mensajes,
        r.grupos_propios, r.grupos_integrante;
      v_conservadas := v_conservadas + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.cuentas_borradas_sin_51
      (id, phone, role, full_name, creada_at, tenia_servicios, tenia_postulaciones, tenia_mensajes)
    VALUES (r.id, r.phone, r.role, r.full_name, r.created_at, r.servicios, r.postulaciones, r.mensajes)
    ON CONFLICT (id) DO NOTHING;

    BEGIN
      -- La cuenta de acceso es la que manda: al borrarla se va su perfil y todo lo suyo.
      DELETE FROM auth.users WHERE id = r.id;
      IF r.phone IS NULL THEN v_sin_telefono_borradas := v_sin_telefono_borradas + 1; END IF;
      RAISE NOTICE 'BORRADA % | rol % | sin nada dentro', coalesce(r.phone, '(SIN TELEFONO)'), r.role;
      v_borradas := v_borradas + 1;
    EXCEPTION
      WHEN foreign_key_violation THEN
        RAISE NOTICE 'SE CONSERVA % | la base no deja borrarla: tiene algo enganchado que no se va en cascada',
          coalesce(r.phone, '(SIN TELEFONO)');
        v_conservadas := v_conservadas + 1;
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'NO SE PUDO BORRAR % | este rol de la base no puede borrar cuentas de acceso (auth.users): hace falta el rol dueño',
          coalesce(r.phone, '(SIN TELEFONO)');
        v_conservadas := v_conservadas + 1;
    END;
  END LOOP;

  RAISE NOTICE 'RESUMEN: % borradas (% sin telefono), % conservadas por tener datos',
    v_borradas, v_sin_telefono_borradas, v_conservadas;
END $$;

-- ============================================
-- Lo que quedó (para leerlo de un vistazo)
-- ============================================
SELECT
  coalesce(phone, '(SIN TELEFONO)') AS telefono,
  role AS rol,
  creada_at::date AS creada,
  tenia_servicios AS servicios,
  tenia_postulaciones AS postulaciones
FROM public.cuentas_borradas_sin_51
ORDER BY creada_at;

-- ============================================
-- ¿Quién queda en la base, y con qué rol? (el estado final)
-- ============================================
SELECT
  coalesce(phone, '(SIN TELEFONO)') AS telefono,
  role AS rol,
  count(*) OVER () AS cuentas_totales
FROM public.profiles
ORDER BY created_at;

COMMIT;
