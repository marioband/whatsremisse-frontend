-- ============================================
-- demo_del_mapa.sql — un viaje de demostración para VER la página del mapa
-- ============================================
-- Crea un viaje de mentira (marcado como archivado: no aparece en las listas de la app)
-- con su link público, para abrir en el teléfono:
--
--     https://whatsremisse.tech/viaje/demo-del-mapa
--
-- No toca ninguna cuenta: el proveedor es tu cuenta de administrador, así que la marca
-- sale con los valores de la casa (el nombre y los colores reales se configuran en el
-- panel cuando quieras; esto es solo para mirar la interfaz).
--
-- Se puede correr varias veces (primero borra el demo anterior).
-- Para quitarlo del todo: quitar_demo_del_mapa.sql
--
-- Aplicar con (una línea, desde la carpeta supabase):
--   cat demo_del_mapa.sql | docker exec -i supabase-db psql -U supabase_admin -d postgres

BEGIN;

DELETE FROM public.seguimientos_del_viaje WHERE token = 'demo-del-mapa';
DELETE FROM public.seguimiento_posiciones WHERE service_id = 'a0000000-0000-4000-8000-00000000d3e0';
DELETE FROM public.service_alerts WHERE id = 'a0000000-0000-4000-8000-00000000d3e0';

INSERT INTO public.service_alerts (
  id, provider_id, title, description, origin_address, origin_lat, origin_lng,
  destination_address, destination_lat, destination_lng, status,
  assigned_driver_id, driver_progress_step, archived, trazo_polyline
)
SELECT 'a0000000-0000-4000-8000-00000000d3e0'::uuid, p.id,
  'Viaje de demostración (para ver el mapa)',
  'Creado por demo_del_mapa.sql — se borra con quitar_demo_del_mapa.sql.',
  'Av. Javier Prado Este 2000, San Borja, Lima', -12.0865, -76.9964,
  'Aeropuerto Internacional Jorge Chávez, Callao', -12.0219, -77.1143,
  'STATUS_IN_PROGRESS', p.id, 2, TRUE,
  'rswhAnj}tMc`@vqDku@vsColAv{Do{AfnB{kAfr@kdAby@'
FROM public.profiles p WHERE p.role = 'ADMIN' LIMIT 1;

INSERT INTO public.seguimientos_del_viaje (token, service_id, creado_por, expira_at)
SELECT 'demo-del-mapa', 'a0000000-0000-4000-8000-00000000d3e0'::uuid, p.id, now() + interval '7 days'
FROM public.profiles p WHERE p.role = 'ADMIN' LIMIT 1;

INSERT INTO public.seguimiento_posiciones (service_id, lat, lng)
VALUES ('a0000000-0000-4000-8000-00000000d3e0'::uuid, -12.0855, -77.0008);

COMMIT;

SELECT 'https://whatsremisse.tech/viaje/demo-del-mapa' AS abrir_en_el_telefono,
       'demo: se quita con quitar_demo_del_mapa.sql' AS nota;
