-- 0056_avisos_de_alerta_con_unidades_y_bloqueos.sql
--
-- EL AVISO DE «SERVICIO NUEVO» SALE CON LAS MISMAS REGLAS QUE LA LISTA (10-10-2026).
--
-- Reportes del usuario al revisar los bloqueos:
--   * «la alerta push de servicio a unidades x e y no solo llega a x e y, sino también a z»:
--     el aviso se mandaba a TODO el grupo, sin mirar las unidades del conductor.
--   * «alerta a un grupo donde integra un conductor bloqueado: no le llega la tarjeta (bien),
--     pero SÍ le llega el aviso»: el aviso no miraba los bloqueos.
--
-- Regla: a un miembro del grupo se le avisa SOLO si la tarjeta también le aparecería a él:
--   1) unidades: el conductor recibe la alerta si comparte ALGUNA unidad con las que pide
--      (las del perfil + las «extra» de su filtro; requisito vacío/`Todos` = cualquiera).
--      Misma regla de `lib/unidades.ts` (`coincideConLaUnidad`).
--   2) bloqueos (0055): ni a quien el proveedor bloqueó, ni a quien lo bloqueó a él.
--
-- Se agrega `profiles.unidades_extra` (el filtro del conductor vivía solo en el teléfono; el
-- aviso es del servidor y necesita el dato completo). La app lo guarda al cambiar el filtro.
--
-- Se aplica con el rol DUEÑO (`supabase_admin`), después de la 0055. Es opcional: sin ella los
-- avisos siguen saliendo como hasta hoy.

BEGIN;

-- ============================================
-- 1) El filtro del conductor, en el perfil (para que el aviso pueda leerlo)
-- ============================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS unidades_extra TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.profiles.unidades_extra IS
  'Unidades EXTRA marcadas en «Filtro conductor» (0056): las más pequeñas que la suya que también quiere recibir.';

-- ============================================
-- 2) Las dos reglas puras (espejo de lib/unidades.ts)
-- ============================================
-- Lo que PIDE una alerta: la forma nueva (`vehicle_requirements.vehicle_type`, lista o texto)
-- y la vieja (`vehicle_type` con comas). «Todos»/vacío = lista vacía = cualquiera.
CREATE OR REPLACE FUNCTION public.unidades_de_la_alerta(p_alerta public.service_alerts)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH requisito AS (
    SELECT CASE
      WHEN jsonb_typeof(p_alerta.vehicle_requirements->'vehicle_type') IS NULL
        THEN string_to_array(coalesce(p_alerta.vehicle_type, ''), ',')  -- forma vieja
      WHEN jsonb_typeof(p_alerta.vehicle_requirements->'vehicle_type') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(p_alerta.vehicle_requirements->'vehicle_type'))
      ELSE ARRAY[p_alerta.vehicle_requirements->>'vehicle_type']
    END AS lista
  )
  SELECT coalesce(array_agg(DISTINCT trim(u)), '{}'::text[])
  FROM requisito, unnest(requisito.lista) AS u
  WHERE trim(coalesce(u, '')) <> '' AND trim(u) <> 'Todos';
$$;

REVOKE ALL ON FUNCTION public.unidades_de_la_alerta(public.service_alerts) FROM PUBLIC;

-- Lo que PUEDE tomar un conductor: sus unidades del perfil (sin declarar ninguna vale
-- «Auto», como en la app) + las «extra» de su filtro.
CREATE OR REPLACE FUNCTION public.unidades_del_conductor(p_vehicle_data jsonb, p_extra TEXT[])
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH suyas AS (
    SELECT coalesce(array_agg(DISTINCT trim(u)), '{}'::text[]) AS lista
    FROM (
      SELECT jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(p_vehicle_data->'vehicle_type') = 'array'
            THEN p_vehicle_data->'vehicle_type'
          WHEN jsonb_typeof(p_vehicle_data->'vehicle_type') = 'string'
            THEN jsonb_build_array(p_vehicle_data->'vehicle_type')
          ELSE '[]'::jsonb
        END
      ) AS u
    ) t
    WHERE trim(coalesce(u, '')) <> '' AND trim(u) <> 'Todos'
  )
  SELECT (CASE WHEN coalesce(array_length(suyas.lista, 1), 0) = 0 THEN ARRAY['Auto'] ELSE suyas.lista END)
         || coalesce(p_extra, '{}'::text[])
  FROM suyas;
$$;

REVOKE ALL ON FUNCTION public.unidades_del_conductor(jsonb, TEXT[]) FROM PUBLIC;

-- ============================================
-- 3) El aviso de alerta compartida (la versión de la 0035 + los dos filtros)
-- ============================================
CREATE OR REPLACE FUNCTION public.avisar_alerta_compartida()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  servicio public.service_alerts;
  destinatarios uuid[];
  etiqueta_del_servicio text;
begin
  select * into servicio from public.service_alerts where id = new.service_id;
  if servicio.id is null then
    return new;
  end if;

  -- La misma etiqueta para todos los grupos de este servicio: es lo que permite saber quién ya
  -- fue avisado, y además agrupa el aviso en el teléfono (uno reemplaza al otro).
  etiqueta_del_servicio := 'alerta-' || servicio.id::text;

  select array_agg(distinct m.user_id)
    into destinatarios
    from public.group_members m
    join public.profiles p on p.id = m.user_id
   where m.group_id = new.group_id
     and m.user_id <> servicio.provider_id
     -- 0056 (a): solo a las unidades que la alerta pide (misma regla de `lib/unidades.ts`).
     and (
       coalesce(array_length(public.unidades_de_la_alerta(servicio), 1), 0) = 0
       or public.unidades_de_la_alerta(servicio) && public.unidades_del_conductor(p.vehicle_data, p.unidades_extra)
     )
     -- 0056 (b): el bloqueo también calla el aviso (ni a quien bloqueé ni a quien me bloqueó).
     and not exists (
       select 1
         from public.bloqueos b
        where (b.bloqueador_id = servicio.provider_id and b.bloqueado_id = m.user_id)
           or (b.bloqueador_id = m.user_id and b.bloqueado_id = servicio.provider_id)
     )
     -- Y nunca a quien ya tiene un aviso de ESTE servicio: ni spam, ni repetidos.
     and not exists (
       select 1
         from public.avisos_cola c
        where c.etiqueta = etiqueta_del_servicio
          and m.user_id = any (c.destinatarios)
     );

  perform public.avisar(
    destinatarios,
    split_part(coalesce((select p.full_name from public.profiles p where p.id = (select s.provider_id from public.service_alerts s where s.id = new.service_id)), 'Alguien'), ' ', 1),
    coalesce((select g.name from public.groups g where g.id = new.group_id), 'Mensaje de servicio') || E'\n' || ('Publicó un servicio en tu grupo: ' || coalesce((select s.title from public.service_alerts s where s.id = new.service_id), 'tu grupo')),
    '/inicio',
    etiqueta_del_servicio
  );
  return new;
end;
$$;

COMMIT;
