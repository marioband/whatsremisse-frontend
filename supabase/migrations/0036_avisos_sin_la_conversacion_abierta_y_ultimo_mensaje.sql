-- 0036_avisos_sin_la_conversacion_abierta_y_ultimo_mensaje.sql
--
-- Dos cosas que pidió el usuario el 20-09-2026:
--
-- 1) NO AVISAR SI YA ESTÁS EN ESA CONVERSACIÓN; SÍ AVISAR SI MINIMIZAS LA APP.
--    («si uno está en un chat conversando, ya no le debería llegar notificaciones, pero si
--     minimiza el app, ahí sí debería llegarle»)
--    La app marca «estoy viendo esta conversación» mientras la pantalla del chat está abierta Y
--    a la vista, y la marca la borra en cuanto la app pasa a segundo plano. `public.avisar()`
--    —que es el ÚNICO sitio por donde salen todos los avisos— descarta a quien tenga marcada esa
--    misma dirección (y no hace más de 2 minutos: una marca vieja de un teléfono que se murió no
--    puede silenciar avisos para siempre).
--    Las direcciones son las mismas que ya llevan los avisos desde la 0034 (`/chat/<servicio>`,
--    `/grupo/<grupo>`), así que un aviso de `/inicio` o `/mis-servicios` NUNCA se descarta: la
--    app solo marca conversaciones.
--
-- 2) EL ÚLTIMO MENSAJE DE CADA GRUPO, para que en Mis grupos los que solo integro se muevan
--    según cuál recibió el último mensaje (con el mismo efecto de deslizamiento que el corazón).
--
-- Se aplica con el rol DUEÑO (`supabase_admin`), después de la 0035.

-- ============================================
-- 1) «estoy viendo esta conversación»
-- ============================================
create table if not exists public.conversaciones_vistas (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  -- La dirección de la conversación, tal cual la usan los avisos: '/chat/<id>' o '/grupo/<id>'.
  url text not null,
  visto_at timestamptz not null default now()
);

comment on table public.conversaciones_vistas is
  'Qué conversación está mirando cada usuario ahora mismo (latido de la app). Sirve para no avisar de lo que ya se está viendo.';

alter table public.conversaciones_vistas enable row level security;
-- Sin políticas: la tocan solo las funciones de abajo (security definer), no el cliente directo.

-- Cuánto vale una marca. Corto a propósito: si el teléfono se queda sin batería con el chat
-- abierto, pasados dos minutos los avisos vuelven solos.
create or replace function public.esta_viendo_la_conversacion(p_usuario uuid, p_url text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.conversaciones_vistas v
     where v.usuario_id = p_usuario
       and v.url = p_url
       and v.visto_at > now() - interval '2 minutes'
  )
$$;

comment on function public.esta_viendo_la_conversacion(uuid, text) is
  '¿Este usuario está mirando AHORA esta conversación? (marca con menos de 2 minutos)';

-- La app la llama al abrir el chat y en cada latido mientras siga a la vista.
create or replace function public.marcar_conversacion_vista(p_url text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  quien uuid := auth.uid();
  direccion text := coalesce(trim(p_url), '');
begin
  if quien is null or direccion = '' then
    return false;
  end if;

  insert into public.conversaciones_vistas (usuario_id, url, visto_at)
  values (quien, direccion, now())
  on conflict (usuario_id) do update
    set url = excluded.url,
        visto_at = now();

  return true;
exception
  when others then
    -- Que no se pueda marcar no puede romper el chat.
    raise warning 'No se pudo marcar la conversación vista: %', sqlerrm;
    return false;
end;
$$;

-- Al salir del chat o al minimizar la app: la marca se borra en el acto, así el aviso
-- vuelve a llegar sin esperar a que venza.
create or replace function public.cerrar_conversacion_vista()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  quien uuid := auth.uid();
begin
  if quien is null then
    return false;
  end if;

  delete from public.conversaciones_vistas where usuario_id = quien;
  return true;
exception
  when others then
    raise warning 'No se pudo cerrar la conversación vista: %', sqlerrm;
    return false;
end;
$$;

-- ============================================
-- El envío, con el filtro nuevo (el mismo de la 0029, más la marca de «lo estoy viendo»)
-- ============================================
create or replace function public.avisar(p_destinatarios uuid[], p_titulo text, p_cuerpo text, p_url text default '/', p_etiqueta text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  destinatarios uuid[];
  direccion text := coalesce(p_url, '/');
begin
  -- Nada de avisos sin destinatarios ni sin texto.
  if p_destinatarios is null or array_length(p_destinatarios, 1) is null then
    return;
  end if;
  if coalesce(p_titulo, '') = '' or coalesce(p_cuerpo, '') = '' then
    return;
  end if;

  -- Quien está mirando ESA conversación ahora mismo no recibe el aviso: lo está viendo.
  select array_agg(d)
    into destinatarios
    from unnest(p_destinatarios) as d
   where not public.esta_viendo_la_conversacion(d, direccion);

  -- Todos la estaban mirando: no hay nada que apuntar.
  if destinatarios is null then
    return;
  end if;

  -- El aviso se APUNTA y se sigue: escribir en la cola es rápido y no puede fallar por la red.
  -- El programa del VPS lo recoge un momento después (ver scripts/enviar-avisos.mjs).
  insert into public.avisos_cola (destinatarios, titulo, cuerpo, url, etiqueta)
  values (destinatarios, p_titulo, p_cuerpo, direccion, p_etiqueta);
exception
  when others then
    -- Un aviso que no se puede apuntar nunca puede romper un mensaje: se anota y se sigue.
    raise warning 'No se pudo apuntar el aviso: %', sqlerrm;
end;
$$;

-- ============================================
-- 2) El último mensaje de cada grupo (para el orden de Mis grupos)
-- ============================================
create or replace function public.grupos_ultimo_mensaje()
returns table (group_id uuid, ultimo_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select m.group_id,
         max(ms.created_at) as ultimo_at
    from public.group_members m
    join public.messages ms
      on ms.group_id = m.group_id
     -- «Recibido»: lo que escribí yo no mueve el grupo de sitio (la misma regla que el
     -- contador de sin leer).
     and ms.sender_id <> m.user_id
   where m.user_id = auth.uid()
   group by m.group_id
$$;

comment on function public.grupos_ultimo_mensaje() is
  'Cuándo llegó el último mensaje de cada grupo (sin contar los míos), para ordenar Mis grupos.';
