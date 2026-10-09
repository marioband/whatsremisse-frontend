-- ============================================
-- quitar_demo_del_mapa.sql — borra el demo del mapa (viaje, link, posición y conductor de práctica)
-- ============================================
-- Deja la base como si el demo nunca hubiera existido.
-- Aplicar con (una línea, desde la carpeta supabase):
--   cat quitar_demo_del_mapa.sql | docker exec -i supabase-db psql -U supabase_admin -d postgres

BEGIN;

DELETE FROM public.seguimientos_del_viaje WHERE token = 'demo-del-mapa';
DELETE FROM public.seguimiento_posiciones WHERE service_id = 'a0000000-0000-4000-8000-00000000d3e0';
DELETE FROM public.service_alerts WHERE id = 'a0000000-0000-4000-8000-00000000d3e0';
DELETE FROM public.profiles WHERE id = 'a0000000-0000-4000-8000-00000000d3d1';
DELETE FROM auth.users WHERE id = 'a0000000-0000-4000-8000-00000000d3d1';

COMMIT;

SELECT 'Demo borrado: el link ya no muestra nada y no queda ninguna cuenta de práctica' AS resultado;
