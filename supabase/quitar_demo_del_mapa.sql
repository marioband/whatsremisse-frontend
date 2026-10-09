-- ============================================
-- quitar_demo_del_mapa.sql — borra el viaje de demostración del mapa
-- ============================================
-- Deja la base como si el demo nunca hubiera existido (el viaje, su link y su posición).
-- Aplicar con (una línea, desde la carpeta supabase):
--   cat quitar_demo_del_mapa.sql | docker exec -i supabase-db psql -U supabase_admin -d postgres

BEGIN;

DELETE FROM public.seguimientos_del_viaje WHERE token = 'demo-del-mapa';
DELETE FROM public.seguimiento_posiciones WHERE service_id = 'a0000000-0000-4000-8000-00000000d3e0';
DELETE FROM public.service_alerts WHERE id = 'a0000000-0000-4000-8000-00000000d3e0';

COMMIT;

SELECT 'Demo borrado: el link del mapa ya no muestra nada' AS resultado;
