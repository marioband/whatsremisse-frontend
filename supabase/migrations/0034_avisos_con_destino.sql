-- 0034_avisos_con_destino.sql
--
-- Hasta aquí, TODOS los avisos abrían la app en el inicio: no había direcciones a las que apuntar
-- (la app estrenaba su mapa de direcciones en la misma vuelta, ver `RootNavigator`: /chat/<id>,
-- /grupo/<id>, /mis-servicios, /inicio).
--
-- Ahora cada aviso lleva a su pantalla:
--   postulación / servicio liberado  -> tus servicios (donde está la tarjeta y la decisión)
--   te aceptaron / mensaje del chat  -> el chat de ESE servicio
--   reporte de avance                -> el chat de ESE servicio
--   mensaje de grupo / grupo nuevo   -> ESE grupo
--   alerta de servicio nuevo         -> el inicio (ahí están los disponibles)
--   te agregaron a un grupo          -> ESE grupo
--   postulación rechazada            -> el inicio
--
-- Se aplica con el rol DUEÑO (`supabase_admin`), después de la 0033.

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
    '/inicio',
    etiqueta_del_servicio
  );
  return new;
end;
$$;;

create or replace function public.avisar_postulacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  servicio public.service_alerts;
begin
  select * into servicio from public.service_alerts where id = new.service_id;
  if servicio.id is null then
    return new;
  end if;

  perform public.avisar(
    array[servicio.provider_id],
    'Nueva postulación',
    'Un conductor se postuló a: ' || coalesce(servicio.title, 'tu servicio'),
    '/mis-servicios',
    'postulacion-' || new.id::text
  );
  return new;
end;
$$;;

create or replace function public.avisar_postulacion_rechazada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  servicio public.service_alerts;
begin
  if new.status <> 'REJECTED' or old.status = 'REJECTED' then
    return new;
  end if;

  select * into servicio from public.service_alerts where id = new.service_id;

  perform public.avisar(
    array[new.driver_id],
    'Postulación no aceptada',
    'Tu postulación no fue aceptada para: ' || coalesce(servicio.title, 'un servicio'),
    '/inicio',
    'rechazo-' || new.id::text
  );
  return new;
end;
$$;;

create or replace function public.avisar_conductor_aceptado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo cuando ENTRA un conductor (de nadie a alguien, o de uno a otro).
  if new.assigned_driver_id is null then
    return new;
  end if;
  if new.assigned_driver_id is not distinct from old.assigned_driver_id then
    return new;
  end if;

  perform public.avisar(
    array[new.assigned_driver_id],
    'Te aceptaron',
    'Fuiste aceptado en el servicio: ' || coalesce(new.title, ''),
    '/chat/' || new.id::text,
    'aceptado-' || new.id::text
  );
  return new;
end;
$$;;

create or replace function public.avisar_mensaje_de_servicio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  servicio public.service_alerts;
  destinatarios uuid[];
begin
  select * into servicio from public.service_alerts where id = new.service_id;
  if servicio.id is null then
    return new;
  end if;

  -- A los dos lados de ESA conversación: el proveedor, el conductor de la conversación (postulante
  -- o aceptado) y el asignado, si lo hubiera. Nunca a quien escribe.
  destinatarios := array[servicio.provider_id, new.driver_id, servicio.assigned_driver_id];
  destinatarios := array_remove(destinatarios, null);
  destinatarios := array_remove(destinatarios, new.sender_id);
  destinatarios := (select array_agg(distinct d) from unnest(destinatarios) as d);

  perform public.avisar(
    destinatarios,
    'Mensaje del servicio',
    left(coalesce(new.content, 'Te escribieron'), 140),
    '/chat/' || new.service_id::text,
    'servicio-' || new.service_id::text
  );
  return new;
end;
$$;;

create or replace function public.avisar_mensaje_de_grupo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  destinatarios uuid[];
  nombre text;
begin
  -- Los que no lo silenciaron ni son el autor (la función de la 0028 ya hace el filtro).
  select array_agg(d.user_id) into destinatarios
    from public.destinatarios_del_grupo(new.group_id, new.sender_id) d;

  select name into nombre from public.groups where id = new.group_id;

  perform public.avisar(
    destinatarios,
    nombre,
    left(coalesce(new.content, 'Te escribieron'), 140),
    '/grupo/' || new.group_id::text,
    'grupo-' || new.group_id::text
  );
  return new;
end;
$$;;

create or replace function public.avisar_hito_del_viaje()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  texto text;
begin
  if new.driver_progress_step is not distinct from old.driver_progress_step then
    return new;
  end if;

  texto := case
             when new.status = 'STATUS_COMPLETED' then 'El conductor terminó el servicio'
             when new.driver_progress_step = 1 then 'El conductor llegó al punto de origen'
             when new.driver_progress_step = 2 then 'El conductor inició el viaje'
             else 'El conductor va al destino ' || new.driver_progress_step::text
           end;

  perform public.avisar(
    array[new.provider_id],
    'Avance del servicio',
    texto || ' · ' || coalesce(new.title, ''),
    '/chat/' || new.id::text,
    'hito-' || new.id::text
  );
  return new;
end;
$$;;

create or replace function public.avisar_servicio_liberado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo cuando el servicio se queda SIN conductor (antes tenía uno).
  if new.assigned_driver_id is not null or old.assigned_driver_id is null then
    return new;
  end if;

  perform public.avisar(
    array[new.provider_id],
    'Servicio liberado',
    'El conductor dejó el servicio: ' || coalesce(new.title, ''),
    '/mis-servicios',
    'liberado-' || new.id::text
  );
  return new;
end;
$$;;

create or replace function public.avisar_miembro_agregado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  nombre text;
begin
  -- Al dueño no se le avisa de su propio grupo recién creado.
  select name into nombre from public.groups where id = new.group_id;
  if exists (select 1 from public.groups g where g.id = new.group_id and g.owner_id = new.user_id) then
    return new;
  end if;

  perform public.avisar(
    array[new.user_id],
    'Te agregaron a un grupo',
    'Ahora estás en: ' || coalesce(nombre, 'un grupo'),
    '/grupo/' || new.group_id::text,
    'grupo-nuevo-' || new.group_id::text
  );
  return new;
end;
$$;;
