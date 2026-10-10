-- Doctor del trazo de la ruta (10-10-2026). Responde: ¿los servicios tienen guardado el
-- RECORRIDO que dibuja la página del cliente, o quedaron con la medida vieja (línea recta)?
--
-- Se corre desde /opt/data/whatsremisse/frontend/supabase con:
--   cat diagnostico_del_trazo.sql | docker exec -i supabase-db psql -U supabase_admin -d postgres
--
-- Qué mirar en la salida:
--   * sin_trazo: si es mayor que 0 y son tus servicios activos, abrir la app una vez los
--     completa solos (o tocar «Compartir viaje» en cada uno);
--   * en la lista de enlaces: `tiene_trazo = t` y `largo` de mas de 50 = el recorrido esta
--     guardado (la pagina lo dibuja); `f` = le falta.

\echo '== servicios con trazo y sin trazo:'
select count(*) filter (where trazo_polyline is not null) as con_trazo,
       count(*) filter (where trazo_polyline is null) as sin_trazo
from public.service_alerts;

\echo ''
\echo '== los ultimos enlaces creados (token completo para probar la pagina):'
select l.token, s.trazo_polyline is not null as tiene_trazo,
       length(s.trazo_polyline) as largo, s.updated_at::timestamp(0) as guardado
from public.seguimientos_del_viaje l
join public.service_alerts s on s.id = l.service_id
order by l.created_at desc
limit 5;
