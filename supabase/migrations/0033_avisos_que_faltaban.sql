-- 0033_avisos_que_faltaban.sql
--
-- Los cuatro avisos de la lista del 19-09-2026 (los puntos 3, 4 y 5 ya estaban cubiertos por el
-- aviso del chat del servicio, porque el pago se anota como mensaje del sistema):
--   1) te postulan a un servicio       -> avisa al proveedor
--   2) te rechazan la postulación      -> avisa al conductor
--   6) te agregan a un grupo           -> avisa al nuevo miembro
--   7) el conductor libera el servicio -> avisa al proveedor
--
-- Se aplica con el rol DUEÑO (`supabase_admin`), después de la 0032.

-- ============================================
-- 1) Te postulan -> al proveedor
-- ============================================
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
    '/',
    'postulacion-' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists avisar_postulacion on public.applications;
create trigger avisar_postulacion
after insert on public.applications
for each row execute function public.avisar_postulacion();

-- ============================================
-- 2) Te rechazan -> al conductor (solo si cambia a RECHAZADA)
-- ============================================
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
    '/',
    'rechazo-' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists avisar_postulacion_rechazada on public.applications;
create trigger avisar_postulacion_rechazada
after update on public.applications
for each row execute function public.avisar_postulacion_rechazada();

-- ============================================
-- 6) Te agregan a un grupo -> al nuevo miembro
-- ============================================
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
    '/',
    'grupo-nuevo-' || new.group_id::text
  );
  return new;
end;
$$;

drop trigger if exists avisar_miembro_agregado on public.group_members;
create trigger avisar_miembro_agregado
after insert on public.group_members
for each row execute function public.avisar_miembro_agregado();

-- ============================================
-- 7) El conductor libera el servicio -> al proveedor
-- ============================================
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
    '/',
    'liberado-' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists avisar_servicio_liberado on public.service_alerts;
create trigger avisar_servicio_liberado
after update on public.service_alerts
for each row execute function public.avisar_servicio_liberado();
