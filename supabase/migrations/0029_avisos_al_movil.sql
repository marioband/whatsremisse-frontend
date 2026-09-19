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
-- 0) La extensión que manda la petición
-- ============================================
-- `pg_net` es la que hace la llamada HTTP a la función desde la base. En Supabase ya viene.
-- Si esta línea diera error, se activa en Supabase → Database → Extensions → `pg_net`.
create extension if not exists pg_net;

-- ============================================
-- La dirección y la llave con la que se llama a la función
-- ============================================
create table if not exists public.avisos_config (
  id boolean primary key default true check (id),
  url text,
  clave text,
  actualizado_at timestamptz not null default now()
);

comment on table public.avisos_config is
  'Una sola fila: la dirección de la función enviar-aviso y la clave de servicio para llamarla.';
comment on column public.avisos_config.clave is
  'Clave de servicio de Supabase (secreta). Se rellena desde el terminal, no se versiona.';

alter table public.avisos_config enable row level security;
-- Sin políticas: solo el servidor (que ignora RLS) puede leerla. Es a propósito.

-- ============================================
-- El envío, en un solo sitio
-- ============================================
create or replace function public.avisar(p_destinatarios uuid[], p_titulo text, p_cuerpo text, p_url text default '/', p_etiqueta text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  config public.avisos_config;
begin
  -- Nada de avisos sin destinatarios, sin título o sin dirección configurada.
  if p_destinatarios is null or array_length(p_destinatarios, 1) is null then
    return;
  end if;

  select * into config from public.avisos_config limit 1;
  if config.url is null or config.clave is null then
    return;
  end if;

  -- `pg_net` manda la petición en segundo plano: el chat no espera a que salga el aviso.
  perform net.http_post(
    url := config.url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || config.clave
    ),
    body := jsonb_build_object(
      'destinatarios', to_jsonb(p_destinatarios),
      'titulo', p_titulo,
      'cuerpo', p_cuerpo,
      'url', p_url,
      'etiqueta', p_etiqueta
    ),
    timeout_milliseconds := 5000
  );
exception
  when others then
    -- Un aviso que no sale nunca puede romper un mensaje: se anota y se sigue.
    raise warning 'No se pudo avisar: %', sqlerrm;
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
-- 6) Lo que falta rellenar (una vez, desde el terminal)
-- ============================================
-- Rellena `url` con la dirección de tu función y `clave` con la clave de servicio:
--
--   insert into public.avisos_config (url, clave)
--   values ('https://<tu-proyecto>.supabase.co/functions/v1/enviar-aviso', '<clave-de-servicio>')
--   on conflict (id) do update set url = excluded.url, clave = excluded.clave, actualizado_at = now();
--
-- Mientras eso esté vacío, los disparadores no mandan nada (y no rompen nada).
