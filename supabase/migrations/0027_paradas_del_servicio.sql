-- 0027_paradas_del_servicio.sql
--
-- El proveedor puede añadir más de un punto al servicio («Nuevo servicio» → «Añadir punto»).
-- Con varias paradas, el avance del conductor es parada por parada y no el de siempre:
--
--   1 parada  (lo de siempre): Ubicado(1) → En proceso(2) → Finalizado(3)
--   N paradas:                 Ir a destino 1(1) → … → Ir a destino N(N) → Finalizado(N+1)
--
-- Se aplica con el rol DUEÑO de las tablas (ver la nota de migraciones: `-U postgres` NO sirve
-- para cambios de estructura).

alter table public.service_alerts
  add column if not exists destinations jsonb;

comment on column public.service_alerts.destinations is
  'Paradas del servicio en orden; la última es el destino final. Vacío o NULL = un solo destino.';

-- ============================================
-- Reporte del avance: el tope del paso deja de ser 3 y depende de las paradas del servicio
-- ============================================
create or replace function public.reportar_progreso_servicio(p_service_id uuid, p_paso smallint)
returns public.service_alerts
language plpgsql
security definer
set search_path = public
as $$
declare
  fila public.service_alerts;
  paradas int;
  ultimo int;
begin
  select case
           when jsonb_typeof(coalesce(s.destinations, '[]'::jsonb)) = 'array'
             then jsonb_array_length(s.destinations)
           else 0
         end
    into paradas
    from public.service_alerts s
   where s.id = p_service_id;

  paradas := coalesce(paradas, 0);
  -- Con un solo destino se mantiene el modelo de siempre (3 pasos); con N paradas, N + 1.
  ultimo := greatest(3, paradas + 1);

  if p_paso is null or p_paso < 1 or p_paso > ultimo then
    raise exception 'Paso inválido: % (se espera 1..%)', p_paso, ultimo;
  end if;

  if not exists (
    select 1 from public.service_alerts s
    where s.id = p_service_id and s.assigned_driver_id = auth.uid()
  ) then
    raise exception 'Solo el conductor asignado puede reportar el proceso del servicio %', p_service_id;
  end if;

  update public.service_alerts s
     set driver_progress_step = p_paso,
         -- El 2 es «viaje iniciado»; el último paso cierra el servicio y abre el cuadre.
         status = case
                    when p_paso >= ultimo then 'STATUS_COMPLETED'
                    when p_paso >= 2 then 'STATUS_IN_PROGRESS'
                    else s.status
                  end,
         settlement_enabled = case when p_paso >= ultimo then true else s.settlement_enabled end,
         completed_at = case when p_paso >= ultimo then now() else s.completed_at end,
         updated_at = now()
   where s.id = p_service_id
     and s.assigned_driver_id = auth.uid()
     and s.driver_progress_step <= p_paso  -- nunca hacia atrás (evita el bucle)
  returning * into fila;

  -- Si ya estaba en ese paso o más adelante, se devuelve la fila tal cual.
  if fila.id is null then
    select * into fila from public.service_alerts where id = p_service_id;
  end if;

  return fila;
end;
$$;
