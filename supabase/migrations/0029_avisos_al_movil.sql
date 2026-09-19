-- 0029_avisos_al_movil.sql
--
-- Los disparadores que avisan al teléfono. Se llaman a la función `enviar-aviso` (Edge Function),
-- que es la que firma y manda el aviso al navegador (en el iPhone, a Apple).
--
-- Cuatro avisos, los que pidió el usuario el 19-09-2026:
--   1) alerta de servicio nueva,
--   2) mensaje en el chat de un grupo (menos a quien escribió y menos a quien lo silenció),
--   3) mensaje en el chat de un servicio (al otro lado de la conversación),
--   4) el conductor reporta un hito del viaje.
--
-- ANTES de aplicar esto hay que:
--   a) desplegar la función:  supabase functions deploy enviar-aviso
--   b) poner sus secretos:    supabase secrets set VAPID_PUBLICA=... VAPID_PRIVADA=... AVISOS_CONTACTO=mailto:...
--   c) rellenar la fila de `avisos_config` con la dirección de la función y una clave de servicio
--      (una sola vez, ver el final del archivo).
-- Sin (c) los disparadores no avisan a nadie (y no se rompe nada: queda anotado en la tabla).

-- ============================================
-- La cola de avisos
-- ============================================
-- Cada aviso que hay que mandar queda aquí apuntado, y un pequeño programa que corre en el VPS
-- (cada minuto) los recoge y los manda al teléfono. Así NO hace falta el CLI de Supabase ni
-- desplegar funciones: todo vive en el servidor del usuario, que es donde ya despliega la app.
create table if not exists public.avisos_cola (
  id bigserial primary key,
  creado_at timestamptz not null default now(),
  enviado_at timestamptz,
  intentos smallint not null default 0,
  ultimo_error text,
  destinatarios uuid[] not null,
  titulo text not null,
  cuerpo text not null,
  url text not null default '/',
  etiqueta text
);

-- Lo que el programa busca en cada vuelta: lo pendiente, de lo más viejo a lo más nuevo.
create index if not exists idx_avisos_cola_pendientes on public.avisos_cola(enviado_at, id);

alter table public.avisos_cola enable row level security;
-- Sin políticas: los avisos los escribe y los lee el servidor (que ignora RLS). Un usuario normal
-- no puede ver ni tocar la cola.

-- ============================================
-- El envío, en un solo sitio
-- ============================================
create or replace function public.avisar(p_destinatarios uuid[], p_titulo text, p_cuerpo text, p_url text default '/', p_etiqueta text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Nada de avisos sin destinatarios ni sin texto.
  if p_destinatarios is null or array_length(p_destinatarios, 1) is null then
    return;
  end if;
  if coalesce(p_titulo, '') = '' or coalesce(p_cuerpo, '') = '' then
    return;
  end if;

  -- El aviso se APUNTA y se sigue: escribir en la cola es rápido y no puede fallar por la red.
  -- El programa del VPS lo recoge un momento después (ver scripts/enviar-avisos.mjs).
  insert into public.avisos_cola (destinatarios, titulo, cuerpo, url, etiqueta)
  values (p_destinatarios, p_titulo, p_cuerpo, coalesce(p_url, '/'), p_etiqueta);
exception
  when others then
    -- Un aviso que no se puede apuntar nunca puede romper un mensaje: se anota y se sigue.
    raise warning 'No se pudo apuntar el aviso: %', sqlerrm;
end;
$$;

-- ============================================
-- 1) Alerta de servicio nueva → a los grupos donde se compartió
-- ============================================
-- OJO con dónde va el disparador: al PUBLICAR el servicio todavía no existen sus grupos (el
-- proveedor los elige en el mismo envío, pero la fila de `service_alert_groups` llega después).
-- Probado: disparando en `service_alerts` el aviso salía SIN destinatarios. Por eso el disparador
-- va en el momento en que se COMPARTE el servicio a un grupo, que es cuando ya hay a quién avisar.
create or replace function public.avisar_alerta_compartida()
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

  select array_agg(distinct m.user_id)
    into destinatarios
    from public.group_members m
   where m.group_id = new.group_id
     and m.user_id <> servicio.provider_id;

  perform public.avisar(
    destinatarios,
    'Servicio nuevo',
    coalesce(servicio.title, 'Hay un servicio nuevo en tus grupos'),
    '/',
    'alerta-' || servicio.id::text
  );
  return new;
end;
$$;

drop trigger if exists avisar_alerta_de_servicio on public.service_alerts;
drop trigger if exists avisar_alerta_compartida on public.service_alert_groups;
create trigger avisar_alerta_compartida
after insert on public.service_alert_groups
for each row execute function public.avisar_alerta_compartida();

-- ============================================
-- 2) Mensaje en el chat de un GRUPO
-- ============================================
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
    '/',
    'grupo-' || new.group_id::text
  );
  return new;
end;
$$;

drop trigger if exists avisar_mensaje_de_grupo on public.messages;
create trigger avisar_mensaje_de_grupo
after insert on public.messages
for each row execute function public.avisar_mensaje_de_grupo();

-- ============================================
-- 3) Mensaje en el chat de un SERVICIO → al otro lado
-- ============================================
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

  -- Quien escribe se descarta; el aviso va al proveedor y al conductor asignado.
  destinatarios := array_remove(array[servicio.provider_id, servicio.assigned_driver_id], new.sender_id);
  destinatarios := array_remove(destinatarios, null);

  perform public.avisar(
    destinatarios,
    'Mensaje del servicio',
    left(coalesce(new.content, 'Te escribieron'), 140),
    '/',
    'servicio-' || new.service_id::text
  );
  return new;
end;
$$;

drop trigger if exists avisar_mensaje_de_servicio on public.service_messages;
create trigger avisar_mensaje_de_servicio
after insert on public.service_messages
for each row execute function public.avisar_mensaje_de_servicio();

-- ============================================
-- 4) El conductor reporta un hito → al proveedor
-- ============================================
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
    '/',
    'hito-' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists avisar_hito_del_viaje on public.service_alerts;
create trigger avisar_hito_del_viaje
after update on public.service_alerts
for each row execute function public.avisar_hito_del_viaje();

-- ============================================
-- 6) Lo que queda por hacer (una vez, en el VPS)
-- ============================================
-- 1) `npm install` en el frontend (trae `web-push`, el que firma los avisos).
-- 2) Poner en el `.env` del frontend (ese archivo NO se versiona):
--      VAPID_PUBLICA=<publicKey>
--      VAPID_PRIVADA=<privateKey>
--      AVISOS_CONTACTO=mailto:tu-correo@whatsremisse.tech
--      SUPABASE_SERVICE_ROLE_KEY=<clave de servicio de Supabase>
-- 3) Probar una vuelta a mano:  node scripts/enviar-avisos.mjs
-- 4) Dejarlo corriendo cada minuto: la línea de crontab que está en el propio script.
-- Sin esto, los avisos se quedan apuntados en la cola (y ningún mensaje se rompe).
