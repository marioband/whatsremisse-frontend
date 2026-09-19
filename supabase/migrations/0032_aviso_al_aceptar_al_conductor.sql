-- 0032_aviso_al_aceptar_al_conductor.sql
--
-- Faltaba el aviso más importante del principio: cuando el proveedor ACEPTA a un conductor que
-- postuló, al conductor no le llegaba nada (lo reportó el usuario el 19-09-2026, justo después de
-- aceptar a uno y comprobar que no le sonó el teléfono).
--
-- Se dispara cuando el servicio queda CON un conductor asignado (el que lo tenía antes se
-- descarta), y el aviso va a ese conductor.
--
-- Se aplica con el rol DUEÑO (`supabase_admin`), después de la 0031.

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
    '/',
    'aceptado-' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists avisar_conductor_aceptado on public.service_alerts;
create trigger avisar_conductor_aceptado
after update on public.service_alerts
for each row execute function public.avisar_conductor_aceptado();

comment on function public.avisar_conductor_aceptado() is
  'Avisa al conductor cuando el proveedor lo acepta en un servicio (0032).';
