-- 0040: cuántos mensajes sin leer tiene cada conversación de SERVICIO.
--
-- POR QUÉ: los contadores de los apartados del inicio («Conductor 12», «En proceso 2») tienen que
-- decir las novedades que el usuario aún no ha visto, y entre ellas están los mensajes del chat de
-- servicio. Los grupos ya tenían su contador desde la 0028 (`grupos_sin_leer`, sobre
-- `group_members.last_read_at`); el chat de servicio NO tenía ninguno, aunque desde la 0020 guarda
-- exactamente la misma marca por participante (`service_chat_reads.last_read_at`, que la app escribe
-- al abrir el chat con `marcarLecturaDelServicio`).
--
-- Es el espejo de `grupos_sin_leer`: una fila por conversación (servicio, conductor) en la que
-- participa quien pregunta, con lo que llegó después de su última lectura.
--   - Como el chat del servicio puede existir ANTES de que haya conductor asignado (el proveedor
--     escribe al postulante), las conversaciones se sacan de los propios mensajes y de los
--     servicios ya asignados, no solo de `assigned_driver_id`.
--   - Sin marca de lectura (nunca abrió el chat) cuenta lo que llegó desde que el servicio se
--     publicó, que es cuando empezó a poder llegarle algo.
--
-- `security definer` como la de grupos: la función decide quién ve qué (solo las conversaciones en
-- las que participa) y no depende de las políticas de las tablas.

create or replace function public.servicios_sin_leer()
returns table (service_id uuid, driver_id uuid, sin_leer bigint)
language sql
security definer
set search_path = public
as $$
  with conversaciones as (
    select distinct ms.service_id, ms.driver_id, s.created_at as desde
      from public.service_messages ms
      join public.service_alerts s on s.id = ms.service_id
    union
    select s.id, s.assigned_driver_id, s.created_at
      from public.service_alerts s
     where s.assigned_driver_id is not null
  )
  select c.service_id,
         c.driver_id,
         count(ms.id) filter (
           where ms.created_at > coalesce(r.last_read_at, c.desde)
         ) as sin_leer
    from conversaciones c
    join public.service_alerts s on s.id = c.service_id
    left join public.service_chat_reads r
      on r.service_id = c.service_id
     and r.driver_id = c.driver_id
     and r.user_id = auth.uid()
    left join public.service_messages ms
      on ms.service_id = c.service_id
     and ms.driver_id = c.driver_id
     and ms.sender_id is distinct from auth.uid()
   where s.provider_id = auth.uid()
      or c.driver_id = auth.uid()
   group by c.service_id, c.driver_id, r.last_read_at, c.desde
$$;

comment on function public.servicios_sin_leer() is
  'Mensajes sin leer de cada conversacion de servicio en la que participa quien pregunta (0040).';

grant execute on function public.servicios_sin_leer() to authenticated;

-- Comprobar después de aplicar:
--   select * from public.servicios_sin_leer();
