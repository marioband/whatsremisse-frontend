-- 0037_aviso_al_proveedor_si_el_conductor_anula.sql
--
-- Lo que faltaba (reportado por el usuario el 20-09-2026): «no hay alerta hacia el proveedor
-- cuando un conductor cancela su postulación».
--
-- POR QUÉ NO LO CUBRÍA NADA: cuando el conductor se desiste, la app **BORRA su fila** de
-- `applications` (`borrarMiPostulacion`) — a propósito, para que pueda volver a postularse y la
-- tarjeta siga en «Disponibles»—. Ningún disparador miraba ese DELETE: el aviso de rechazo
-- (`avisar_postulacion_rechazada`, 0033/0035) solo salta cuando la fila pasa a REJECTED, y eso lo
-- hace el PROVEEDOR al no aceptar. Así que al proveedor no le llegaba nada y la tarjeta le
-- aparecía con un postulante menos sin explicación.
--
-- Reglas de este aviso:
--   * Va al PROVEEDOR del servicio, y solo a él.
--   * Solo cuando lo anula EL PROPIO CONDUCTOR (`auth.uid() = old.driver_id`). Si la fila
--     desaparece por otra vía —el proveedor borra su servicio y el ON DELETE CASCADE arrastra las
--     postulaciones, o una limpieza del sistema— NO se avisa: no es «el conductor anuló».
--   * Solo si de verdad se anula algo vivo (`status = 'PENDING'`): una fila ya rechazada no es
--     noticia.
--   * Mismo formato del 0035: fila 1 el nombre de quien hace la acción, fila 2 «Mensaje de
--     servicio» o el grupo, fila 3 la acción.
--
-- Se aplica con el rol DUEÑO (`supabase_admin`), después de la 0036.

create or replace function public.avisar_anulacion_de_postulacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  servicio public.service_alerts;
  nombre_del_conductor text;
begin
  -- Una postulación ya resuelta (o archivada por otra vía) no es una anulación.
  if old.status <> 'PENDING' then
    return old;
  end if;

  -- Quien la anula tiene que ser el conductor de esa fila. Si la borra otro (el proveedor al
  -- eliminar su servicio, una tarea del sistema), no hay nada que contarle al proveedor.
  if auth.uid() is distinct from old.driver_id then
    return old;
  end if;

  select * into servicio from public.service_alerts where id = old.service_id;
  if servicio.id is null then
    return old;
  end if;

  nombre_del_conductor := split_part(
    coalesce((select p.full_name from public.profiles p where p.id = old.driver_id), 'Alguien'),
    ' ',
    1
  );

  perform public.avisar(
    array[servicio.provider_id],
    nombre_del_conductor,
    'Mensaje de servicio' || E'\n' || ('Anuló su postulación a: ' || coalesce(servicio.title, 'tu servicio')),
    '/mis-servicios',
    'anulacion-' || old.id::text
  );

  return old;
end;
$$;

comment on function public.avisar_anulacion_de_postulacion() is
  'Avisa al proveedor cuando un conductor anula (borra) su propia postulación a su servicio.';

drop trigger if exists avisar_anulacion_de_postulacion on public.applications;

create trigger avisar_anulacion_de_postulacion
after delete on public.applications
for each row
execute function public.avisar_anulacion_de_postulacion();
