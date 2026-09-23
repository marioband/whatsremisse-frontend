-- ============================================
-- 0044 · Mis grupos: el resumen de la lista y editar el grupo
-- ============================================
-- Pedido del usuario (23-09-2026), en dos partes:
--
--   1) La tarjeta de cada grupo tiene que verse como WhatsApp: nombre, DEBAJO las dos primeras
--      líneas del último mensaje («Gregory Medina: Gracias Mario»), y a la derecha la hora del
--      último mensaje. Hoy solo se puede saber CUÁNDO llegó el último mensaje recibido
--      (`grupos_ultimo_mensaje`, 0036) — no qué decía ni quién lo escribió. Aquí va la función que
--      trae ese resumen.
--
--   2) En los ajustes del grupo, el creador Y los administradores pueden cambiar el nombre y la
--      foto. La política de `groups` (0002, «Owners manage groups») solo deja al creador, así que
--      las dos funciones de abajo hacen el trabajo ellas mismas y comprueban el rol por dentro
--      (mismo patrón que `remove_group_member` de 0007 y `salir_del_grupo` de 0043).
--
-- NO depende de ninguna migración anterior: la comprobación de rol va escrita aquí contra `groups`
-- y `group_members` (lección de la 0042/0043: en producción faltaba la 0006 entera). Se puede
-- repetir sin daño.
-- ============================================

BEGIN;

-- ============================================
-- 1) El resumen de cada grupo, para la lista de Mis grupos
-- ============================================
-- Devuelve UNA fila por grupo del que soy integrante:
--   * ultimo_recibido_at → cuándo llegó el último mensaje QUE NO ESCRIBÍ (es lo que ordena la lista,
--     la misma regla de 0036: lo mío no mueve el grupo de sitio);
--   * ultimo_at / ultimo_texto / ultimo_tipo → el último mensaje, sea mío o no (es lo que se enseña);
--   * ultimo_autor → el primer nombre de quien escribió, y NULL cuando lo escribí yo (la app pone
--     «Tú»);
--   * ultimo_es_mio → por si la app prefiere decidirlo con un booleano.
create or replace function public.resumen_de_mis_grupos()
returns table (
  group_id uuid,
  ultimo_recibido_at timestamptz,
  ultimo_at timestamptz,
  ultimo_texto text,
  ultimo_tipo text,
  ultimo_autor text,
  ultimo_es_mio boolean
)
language sql
security definer
set search_path = public
stable
as $$
  with ultimo as (
    -- El último mensaje de cada grupo (uno por grupo: el más reciente).
    select distinct on (m.group_id)
           m.group_id, m.created_at, m.content, m.type, m.sender_id
      from public.messages m
     order by m.group_id, m.created_at desc, m.id desc
  )
  select gm.group_id,
         (select max(r.created_at)
            from public.messages r
           where r.group_id = gm.group_id
             and r.sender_id <> gm.user_id) as ultimo_recibido_at,
         u.created_at as ultimo_at,
         u.content    as ultimo_texto,
         u.type       as ultimo_tipo,
         case
           when u.sender_id is null then null
           when u.sender_id = gm.user_id then null
           else coalesce(nullif(split_part(p.full_name, ' ', 1), ''), 'Alguien')
         end as ultimo_autor,
         (u.sender_id = gm.user_id) as ultimo_es_mio
    from public.group_members gm
    left join ultimo u on u.group_id = gm.group_id
    left join public.profiles p on p.id = u.sender_id
   where gm.user_id = auth.uid();
$$;

comment on function public.resumen_de_mis_grupos() is
  'El último mensaje de cada grupo (texto, tipo, autor y hora) para las tarjetas de Mis grupos; el '
  'orden sigue saliendo de ultimo_recibido_at (sin contar los míos).';

REVOKE ALL ON FUNCTION public.resumen_de_mis_grupos() from public;
GRANT EXECUTE ON FUNCTION public.resumen_de_mis_grupos() to authenticated;

-- ============================================
-- 2) Cambiar el nombre del grupo (creador o administrador)
-- ============================================
create or replace function public.cambiar_nombre_del_grupo(p_group_id uuid, p_nombre text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_nombre text := btrim(coalesce(p_nombre, ''));
begin
  if v_uid is null then
    raise exception 'No hay sesión activa. Vuelve a iniciar sesión.' using errcode = '28000';
  end if;

  if not public.puedo_administrar_el_grupo(p_group_id, v_uid) then
    raise exception 'Solo el creador o un administrador del grupo pueden cambiar su nombre.'
      using errcode = '42501';
  end if;

  if v_nombre = '' then
    raise exception 'El nombre del grupo no puede quedar vacío.' using errcode = '22023';
  end if;
  if length(v_nombre) > 60 then
    raise exception 'El nombre del grupo es demasiado largo (máximo 60 caracteres).'
      using errcode = '22023';
  end if;

  update public.groups g set name = v_nombre where g.id = p_group_id;
  return v_nombre;
end;
$$;

comment on function public.cambiar_nombre_del_grupo(uuid, text) is
  'Renombra el grupo. Puede el creador o un administrador (comprobado dentro, no por la política).';

REVOKE ALL ON FUNCTION public.cambiar_nombre_del_grupo(uuid, text) from public;
GRANT EXECUTE ON FUNCTION public.cambiar_nombre_del_grupo(uuid, text) to authenticated;

-- ============================================
-- 3) Cambiar (o quitar) la foto del grupo (creador o administrador)
-- ============================================
create or replace function public.cambiar_foto_del_grupo(p_group_id uuid, p_avatar_url text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_url  text := nullif(btrim(coalesce(p_avatar_url, '')), '');
begin
  if v_uid is null then
    raise exception 'No hay sesión activa. Vuelve a iniciar sesión.' using errcode = '28000';
  end if;

  if not public.puedo_administrar_el_grupo(p_group_id, v_uid) then
    raise exception 'Solo el creador o un administrador del grupo pueden cambiar su foto.'
      using errcode = '42501';
  end if;

  -- Sin URL se entiende «quitar la foto» (vuelve la inicial del grupo).
  update public.groups g set avatar_url = v_url where g.id = p_group_id;
  return coalesce(v_url, '');
end;
$$;

comment on function public.cambiar_foto_del_grupo(uuid, text) is
  'Cambia la foto del grupo; con cadena vacía o NULL la quita. Creador o administrador.';

REVOKE ALL ON FUNCTION public.cambiar_foto_del_grupo(uuid, text) from public;
GRANT EXECUTE ON FUNCTION public.cambiar_foto_del_grupo(uuid, text) to authenticated;

-- ============================================
-- 4) ¿Puedo administrar este grupo? (la comprobación, en un solo sitio)
-- ============================================
-- Escrita contra `groups` y `group_members` a propósito: no usa `is_group_admin` ni
-- `is_group_owner` (en la base de producción la segunda no existe; ver 0043).
create or replace function public.puedo_administrar_el_grupo(p_group_id uuid, p_uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.groups g
     where g.id = p_group_id
       and (
         g.owner_id = p_uid
         or exists (
           select 1 from public.group_members gm
            where gm.group_id = p_group_id
              and gm.user_id = p_uid
              and gm.role in ('owner', 'admin')
         )
       )
  );
$$;

comment on function public.puedo_administrar_el_grupo(uuid, uuid) is
  '¿Este usuario es el creador del grupo o uno de sus administradores? Para editar el grupo.';

REVOKE ALL ON FUNCTION public.puedo_administrar_el_grupo(uuid, uuid) from public;
GRANT EXECUTE ON FUNCTION public.puedo_administrar_el_grupo(uuid, uuid) to authenticated;

-- (Se declara DESPUÉS de usarse arriba: en plpgsql la función se resuelve al ejecutarse, no al
--  crearse, así que el orden no importa; se deja al final para que se lea primero lo que se pide.)

NOTIFY pgrst, 'reload schema';

COMMIT;
