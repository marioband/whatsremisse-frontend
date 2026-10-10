-- Doctor del trazo de la ruta (10-10-2026). Responde tres cosas:
--   1) que columnas del viaje existen de verdad en service_alerts;
--   2) si los servicios tienen guardado el RECORRIDO (trazo) y la estimacion;
--   3) el token completo de los ultimos enlaces, para probar la pagina tal cual.
--
-- Se corre desde /opt/data/whatsremisse/frontend/supabase con:
--   cat diagnostico_del_trazo.sql | docker exec -i supabase-db psql -U supabase_admin -d postgres

\echo '== 1) columnas del viaje que existen en service_alerts:'
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'service_alerts'
  and (column_name like 'viaje%' or column_name like 'trazo%')
order by column_name;

\echo ''
\echo '== 2) estado por servicio (los ultimos 8):'
select to_jsonb(s)->>'trazo_polyline' is not null as trazo,
       to_jsonb(s)->>'viaje_estimacion' is not null as estim,
       to_jsonb(s)->>'viaje_metros' is not null as metros,
       s.created_at::timestamp(0) as creado
from public.service_alerts s
order by s.created_at desc
limit 8;

\echo ''
\echo '== 3) los ultimos enlaces creados (token completo para probar la pagina):'
select l.token,
       to_jsonb(s)->>'trazo_polyline' is not null as tiene_trazo,
       length(to_jsonb(s)->>'trazo_polyline') as largo,
       s.updated_at::timestamp(0) as guardado
from public.seguimientos_del_viaje l
join public.service_alerts s on s.id = l.service_id
order by s.created_at desc
limit 5;
