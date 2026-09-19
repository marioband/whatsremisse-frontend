-- 0028_avisos_y_grupos_silenciados.sql
--
-- Tres cosas que pidió el usuario el 19-09-2026:
--   1) el globo con el contador de mensajes sin leer en «Mis grupos»,
--   2) poder SILENCIAR un grupo (dejar de recibir avisos de su chat),
--   3) los avisos de verdad en el iPhone (PWA): las suscripciones del navegador.
--
-- Lo aplica el usuario desde su terminal con el rol DUEÑO (`supabase_admin`).

-- ============================================
-- 1) Qué ha leído cada quien y qué tiene silenciado
-- ============================================
alter table public.group_members
  add column if not exists last_read_at timestamptz;
alter table public.group_members
  add column if not exists muted boolean not null default false;

comment on column public.group_members.last_read_at is
  'Última vez que este miembro abrió el chat del grupo. Lo que llegó después está sin leer.';
comment on column public.group_members.muted is
  'Si es true, este miembro no recibe avisos del chat de este grupo.';

-- ============================================
-- 2) El contador de sin leer (una fila por grupo del usuario)
-- ============================================
create or replace function public.grupos_sin_leer()
returns table (group_id uuid, sin_leer bigint)
language sql
security definer
set search_path = public
as $$
  select m.group_id,
         count(ms.id) filter (
           -- Sin `last_read_at` (nunca lo abrió) cuenta lo que llegó desde que entró al grupo.
           where ms.created_at > coalesce(m.last_read_at, m.joined_at)
         ) as sin_leer
    from public.group_members m
    left join public.messages ms
      on ms.group_id = m.group_id
     and ms.sender_id <> m.user_id
   where m.user_id = auth.uid()
   group by m.group_id, m.last_read_at, m.joined_at
$$;

-- Abrir el chat del grupo lo marca como leído.
create or replace function public.marcar_grupo_leido(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.group_members
     set last_read_at = now()
   where group_id = p_group_id
     and user_id = auth.uid();
  return found;
end;
$$;

-- Silenciar (o volver a activar) los avisos del grupo, solo para quien lo pide.
create or replace function public.silenciar_grupo(p_group_id uuid, p_silenciado boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.group_members
     set muted = coalesce(p_silenciado, true)
   where group_id = p_group_id
     and user_id = auth.uid();
  return found;
end;
$$;

-- ============================================
-- 3) Los avisos en el navegador (PWA del iPhone)
-- ============================================
-- Una fila por navegador suscrito. `endpoint` es la dirección que da el navegador (Apple, en el
-- iPhone) y las dos claves son las que cifran el aviso: sin ellas el aviso no se puede entregar.
create table if not exists public.push_web (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_web_user_id on public.push_web(user_id);

alter table public.push_web enable row level security;

-- Cada quien ve y maneja SOLO sus suscripciones; nadie más puede leer esas claves.
drop policy if exists push_web_propias_select on public.push_web;
create policy push_web_propias_select on public.push_web
  for select using (auth.uid() = user_id);

drop policy if exists push_web_propias_insert on public.push_web;
create policy push_web_propias_insert on public.push_web
  for insert with check (auth.uid() = user_id);

drop policy if exists push_web_propias_update on public.push_web;
create policy push_web_propias_update on public.push_web
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists push_web_propias_delete on public.push_web;
create policy push_web_propias_delete on public.push_web
  for delete using (auth.uid() = user_id);

-- El servidor (la función que manda los avisos) necesita leerlas todas: usa la clave de servicio,
-- que ignora RLS, así que aquí no hace falta ninguna política de más.

-- Guardar una suscripción: la misma dirección del navegador se actualiza, no se duplica.
create or replace function public.guardar_suscripcion_de_avisos(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Hay que estar dentro de la app para guardar los avisos';
  end if;

  insert into public.push_web (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
     set user_id = excluded.user_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         user_agent = excluded.user_agent,
         updated_at = now();

  return true;
end;
$$;

-- ============================================
-- 4) Quién debe recibir el aviso de un mensaje de grupo
-- ============================================
-- Devuelve los miembros del grupo que NO son el autor y NO lo tienen silenciado. La usan los
-- avisos: sin el filtro de `muted`, silenciar un grupo no serviría de nada.
create or replace function public.destinatarios_del_grupo(p_group_id uuid, p_autor uuid)
returns table (user_id uuid)
language sql
security definer
set search_path = public
as $$
  select m.user_id
    from public.group_members m
   where m.group_id = p_group_id
     and m.user_id <> p_autor
     and m.muted = false
$$;
