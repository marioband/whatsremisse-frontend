-- ============================================
-- Revisar las cuentas SIN +51 (no borra NADA)
-- ============================================
-- Para VER antes de borrar: lista todas las cuentas cuyo teléfono no empieza por `+51` (incluidas
-- las que no tienen teléfono) con todo lo que tienen dentro. Es el paso previo de
-- `borrar_cuentas_sin_51.sql`.
--
-- Correr (una línea, desde la carpeta `supabase`):
--   cat revisar_cuentas_sin_51.sql | docker exec -i supabase-db psql -U supabase_admin -d postgres

BEGIN;

SELECT
  coalesce(p.phone, '(SIN TELEFONO)') AS telefono,
  p.role AS rol,
  coalesce(p.full_name, '—') AS nombre,
  p.created_at::date AS creada,
  (SELECT count(*) FROM public.service_alerts sa WHERE sa.provider_id = p.id) AS servicios,
  (SELECT count(*) FROM public.applications a WHERE a.driver_id = p.id) AS postulaciones,
  (SELECT count(*) FROM public.messages m WHERE m.sender_id = p.id) AS mensajes,
  (SELECT count(*) FROM public.groups g WHERE g.owner_id = p.id) AS grupos_propios,
  (SELECT count(*) FROM public.group_members gm JOIN public.groups g ON g.id = gm.group_id
    WHERE gm.user_id = p.id AND g.owner_id <> p.id) AS como_integrante
FROM public.profiles p
WHERE p.phone IS NULL OR p.phone NOT LIKE '+51%'
ORDER BY p.phone NULLS FIRST, p.created_at;

-- El resumen: cuántas son y cuántas desaparecerían con `borrar_cuentas_sin_51.sql`.
SELECT
  count(*) AS cuentas_sin_51,
  count(*) FILTER (WHERE upper(coalesce(role, '')) = 'ADMIN') AS administradores_que_se_quedan
FROM public.profiles
WHERE phone IS NULL OR phone NOT LIKE '+51%';

COMMIT;
