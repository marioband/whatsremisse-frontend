-- 0035_avisos_con_formato_y_sin_duplicidad.sql
--
-- Reglas nuevas de los avisos del teléfono, pedidas por el usuario el 19-09-2026:
--
-- 1) FORMATO. Fila 1: el NOMBRE de quien hace la acción (solo el nombre, sin apellidos). Fila 2:
--    «Mensaje de servicio», o el nombre del grupo si viene de un grupo. Fila 3: la acción (el
--    reporte del proceso, el del pago, el mensaje). Fuera el «Sistema:» del texto: eso era lenguaje
--    de la app, no de la persona.
--    La cabecera «From WhatsRemisse» que también pidió quitar NO se puede: la pone iOS con el
--    nombre de la app, no viene en el aviso.
--
-- 2) SIN DUPLICIDAD. Los hitos del viaje («Conductor en el punto de origen», «Viaje iniciado»,
--    «camino al destino N», «Viaje finalizado») se escriben como mensaje del sistema en el chat Y
--    además como reporte de avance; avisaban dos veces. Ahora avisa SOLO el reporte de avance, que
--    es el detallado (lleva origen y destino).
--
-- 3) NUNCA A QUIEN HIZO LA ACCIÓN. El conductor deja de recibir los avisos del proceso (era él
--    quien lo reportaba) y el proveedor deja de recibir los suyos (declarar o confirmar un pago).
--    En los mensajes del sistema el actor no viene en la fila, así que se deduce del texto
--    («Sistema: Conductor …» / «Sistema: El proveedor …»).
--
-- Se aplica con el rol DUEÑO (`supabase_admin`), después de la 0034.

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
    split_part(coalesce((select p.full_name from public.profiles p where p.id = (select s.provider_id from public.service_alerts s where s.id = new.service_id)), 'Alguien'), ' ', 1),
    coalesce((select g.name from public.groups g where g.id = new.group_id), 'Mensaje de servicio') || E'\n' || ('Publicó un servicio en tu grupo: ' || coalesce((select s.title from public.service_alerts s where s.id = new.service_id), 'tu grupo')),
    '/inicio',
    etiqueta_del_servicio
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
    split_part(coalesce((select p.full_name from public.profiles p where p.id = new.sender_id), 'Alguien'), ' ', 1),
    coalesce((select g.name from public.groups g where g.id = new.group_id), 'Mensaje de servicio') || E'\n' || ('Mensaje: ' || left(coalesce(new.content, ''), 120)),
    '/grupo/' || new.group_id::text,
    'grupo-' || new.group_id::text
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
    case
      when new.sender_id is null and new.content ~ '^Sistema: (Viaje|Conductor)' then array[]::uuid[]
      else array_remove(
        destinatarios,
        case
          when new.sender_id is not null then new.sender_id
          when new.content ilike 'Sistema:%conductor%' then (select s.assigned_driver_id from public.service_alerts s where s.id = new.service_id)
          when new.content ilike 'Sistema:%proveedor%' then (select s.provider_id from public.service_alerts s where s.id = new.service_id)
          else null
        end
      )
    end,
    split_part(coalesce((select p.full_name from public.profiles p where p.id = coalesce(new.sender_id, (select s.assigned_driver_id from public.service_alerts s where s.id = new.service_id))), 'Alguien'), ' ', 1),
    'Mensaje de servicio' || E'\n' || ('Mensaje: ' || left(coalesce(new.content, ''), 120)),
    '/chat/' || new.service_id::text,
    'servicio-' || new.service_id::text
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
    split_part(coalesce((select p.full_name from public.profiles p where p.id = new.assigned_driver_id), 'Alguien'), ' ', 1),
    'Mensaje de servicio' || E'\n' || (texto || ' · ' || coalesce(new.title, '')),
    '/chat/' || new.id::text,
    'hito-' || new.id::text
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
    split_part(coalesce((select p.full_name from public.profiles p where p.id = (select s.provider_id from public.service_alerts s where s.id = new.id)), 'Alguien'), ' ', 1),
    'Mensaje de servicio' || E'\n' || ('Te aceptó en el servicio: ' || new.title),
    '/chat/' || new.id::text,
    'aceptado-' || new.id::text
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
    split_part(coalesce((select p.full_name from public.profiles p where p.id = new.driver_id), 'Alguien'), ' ', 1),
    'Mensaje de servicio' || E'\n' || ('Se postuló a tu servicio: ' || servicio.title),
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
    split_part(coalesce((select p.full_name from public.profiles p where p.id = (select s.provider_id from public.service_alerts s where s.id = new.service_id)), 'Alguien'), ' ', 1),
    'Mensaje de servicio' || E'\n' || ('No aceptó tu postulación: ' || (select s.title from public.service_alerts s where s.id = new.service_id)),
    '/inicio',
    'rechazo-' || new.id::text
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
    split_part(coalesce((select p.full_name from public.profiles p where p.id = (select g.owner_id from public.groups g where g.id = new.group_id)), 'Alguien'), ' ', 1),
    coalesce((select g.name from public.groups g where g.id = new.group_id), 'Mensaje de servicio') || E'\n' || ('Te agregó al grupo'),
    '/grupo/' || new.group_id::text,
    'grupo-nuevo-' || new.group_id::text
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
    split_part(coalesce((select p.full_name from public.profiles p where p.id = old.assigned_driver_id), 'Alguien'), ' ', 1),
    'Mensaje de servicio' || E'\n' || ('Dejó tu servicio: ' || new.title),
    '/mis-servicios',
    'liberado-' || new.id::text
  );
  return new;
end;
$$;;
