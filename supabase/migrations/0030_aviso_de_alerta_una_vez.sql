-- 0030_aviso_de_alerta_una_vez.sql
--
-- Un servicio compartido a CINCO grupos = los conductores que están en esos grupos reciben UNA
-- tarjeta (la app ya deduplica para no hacer spam)… pero recibían CINCO avisos, uno por grupo.
-- Lo reportó el usuario el 19-09-2026: «al conductor 1 le llega una notificación por cada grupo
-- donde coinciden; las alertas deberían ser igual que las tarjetas».
--
-- El arreglo es en el servidor, donde se decide a quién avisar: antes de apuntar el aviso se
-- descarta a quien YA tiene uno del mismo servicio (esté en la cola o ya enviado). Así, si el
-- proveedor comparte a cinco grupos, cada conductor recibe lo mismo que ve: UN aviso.
--
-- Se aplica con el rol DUEÑO (`supabase_admin`), después de la 0029.

create or replace function public.avisar_alerta_compartida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  servicio public.service_alerts;
  destinatarios uuid[];
  etiqueta_del_servicio text;
begin
  select * into servicio from public.service_alerts where id = new.service_id;
  if servicio.id is null then
    return new;
  end if;

  -- La misma etiqueta para todos los grupos de este servicio: es lo que permite saber quién ya
  -- fue avisado, y además agrupa el aviso en el teléfono (uno reemplaza al otro).
  etiqueta_del_servicio := 'alerta-' || servicio.id::text;

  select array_agg(distinct m.user_id)
    into destinatarios
    from public.group_members m
   where m.group_id = new.group_id
     and m.user_id <> servicio.provider_id
     -- Nunca al proveedor que lo publicó.
     -- Y nunca a quien ya tiene un aviso de ESTE servicio: ni spam, ni repetidos.
     and not exists (
       select 1
         from public.avisos_cola c
        where c.etiqueta = etiqueta_del_servicio
          and m.user_id = any (c.destinatarios)
     );

  perform public.avisar(
    destinatarios,
    'Servicio nuevo',
    coalesce(servicio.title, 'Hay un servicio nuevo en tus grupos'),
    '/',
    etiqueta_del_servicio
  );
  return new;
end;
$$;

comment on function public.avisar_alerta_compartida() is
  'Avisa a los miembros del grupo al que se comparte un servicio, UNA sola vez por persona y servicio (0030).';
