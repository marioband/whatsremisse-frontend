-- 0031_aviso_del_chat_antes_de_aceptar.sql
--
-- Faltaba un tramo: el chat entre el proveedor y un POSTULANTE, antes de aceptarlo.
-- El aviso del chat de servicio buscaba al conductor ASIGNADO… y antes de aceptar no hay ninguno,
-- así que cuando el proveedor escribía, la lista de destinatarios quedaba vacía y al postulante no
-- le llegaba nada (lo reportó el usuario el 19-09-2026).
--
-- Cada mensaje del chat de servicio lleva su `driver_id` (el conductor de ESA conversación), así
-- que el aviso va al proveedor y a ese conductor; el asignado se suma por si el mensaje es de la
-- conversación ya aceptada. El autor siempre queda fuera.
--
-- Se aplica con el rol DUEÑO (`supabase_admin`), después de la 0029 y la 0030.

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
    '/',
    'servicio-' || new.service_id::text
  );
  return new;
end;
$$;

comment on function public.avisar_mensaje_de_servicio() is
  'Avisa al otro lado del chat de un servicio, también ANTES de aceptar al postulante (0031).';
