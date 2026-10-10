-- ============================================
-- 0051_seguimiento_exclusivo_y_nombre.sql
-- ============================================
-- 10-10-2026, pedido del usuario:
--   1) El botón «Compartir viaje» es EXCLUSIVO de las cuentas que el administrador selecciona en
--      su panel. La app necesita poder preguntarlo SIN leer la tabla (que está cerrada):
--      `seguimiento_mi_activacion()` responde SÍ/NO por quien pregunta.
--   2) El link del viaje lleva el NOMBRE DEL PROVEEDOR (personalización de cada link): manda el
--      nombre de la marca del panel; si no tiene, la MISMA regla de las tarjetas —el configurado en
--      `vehicle_data.provider_name` y, si no está, el primer nombre y el primer apellido (nunca
--      «Empresa»)— y de último 'WhatsRemisse'.
--   OJO: la función que se reemplaza CONSERVA todo lo que le agregó la 0050 (marca, modelo, color
--   y placa de la unidad del conductor, con las claves de la app y el respaldo de «placa» vieja).
--
-- Aplicar con (una sola línea, desde la carpeta supabase):
--   cat 0051_seguimiento_exclusivo_y_nombre.sql | docker exec -i supabase-db psql -U supabase_admin -d postgres

BEGIN;

-- ============================================
-- 1) ¿Está encendido el seguimiento para MI cuenta?
-- ============================================
CREATE OR REPLACE FUNCTION public.seguimiento_mi_activacion()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT m.activo FROM public.marcas_del_seguimiento m WHERE m.profile_id = auth.uid()),
    false
  );
$$;
COMMENT ON FUNCTION public.seguimiento_mi_activacion() IS
  '¿El seguimiento del viaje está activo para MI cuenta? Lo selecciona el administrador; el botón «Compartir viaje» es exclusivo de las cuentas activadas.';

REVOKE ALL ON FUNCTION public.seguimiento_mi_activacion() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.seguimiento_mi_activacion() TO authenticated;
  END IF;
END $$;

-- ============================================
-- 2) La página pública, con el nombre del proveedor
-- ============================================
CREATE OR REPLACE FUNCTION public.seguimiento_del_viaje(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_servicio RECORD;
  v_pos RECORD;
  v_driver RECORD;
  v_prov RECORD;
  v_marca RECORD;
  v_partes TEXT[];
  v_corto TEXT;
BEGIN
  SELECT s.id, s.status, s.completed_at, s.origin_address, s.origin_lat, s.origin_lng,
         s.destination_address, s.destination_lat, s.destination_lng, s.trazo_polyline,
         s.provider_id, s.assigned_driver_id
    INTO v_servicio
    FROM public.seguimientos_del_viaje l
    JOIN public.service_alerts s ON s.id = l.service_id
   WHERE l.token = btrim(coalesce(p_token, ''))
     AND l.revocado_at IS NULL
     AND l.expira_at > now();
  IF NOT FOUND THEN
    RETURN NULL;  -- token inexistente, revocado o vencido: ni una pista
  END IF;
  IF NOT public.seguimiento_visible(v_servicio.status, v_servicio.completed_at) THEN
    RETURN NULL;  -- viaje terminado hace rato, cancelado o todavía sin conductor
  END IF;

  SELECT sp.lat, sp.lng, sp.publicado_at INTO v_pos
    FROM public.seguimiento_posiciones sp WHERE sp.service_id = v_servicio.id;

  SELECT p.full_name, p.vehicle_data INTO v_driver
    FROM public.profiles p WHERE p.id = v_servicio.assigned_driver_id;

  SELECT p.full_name, p.vehicle_data INTO v_prov
    FROM public.profiles p WHERE p.id = v_servicio.provider_id;

  SELECT m.* INTO v_marca FROM public.marcas_del_seguimiento m
   WHERE m.profile_id = v_servicio.provider_id;

  -- El nombre del proveedor con la regla de la casa: primer nombre + primer apellido
  -- (con 4 partes o más, el apellido es la tercera; es la misma cuenta que hace la app).
  v_partes := regexp_split_to_array(btrim(coalesce(v_prov.full_name, '')), '\s+');
  v_corto := nullif(btrim(concat_ws(' ',
    nullif(v_partes[1], ''),
    nullif(CASE WHEN coalesce(array_length(v_partes, 1), 0) >= 4 THEN v_partes[3]
                ELSE v_partes[2] END, ''))), '');

  RETURN jsonb_build_object(
    'estado', v_servicio.status,
    'origen', jsonb_build_object('direccion', v_servicio.origin_address,
                                 'lat', v_servicio.origin_lat, 'lng', v_servicio.origin_lng),
    'destino', jsonb_build_object('direccion', v_servicio.destination_address,
                                  'lat', v_servicio.destination_lat, 'lng', v_servicio.destination_lng),
    'trazo', v_servicio.trazo_polyline,
    'posicion', CASE WHEN v_pos.lat IS NULL THEN NULL ELSE
      jsonb_build_object('lat', v_pos.lat, 'lng', v_pos.lng, 'publicado_at', v_pos.publicado_at) END,
    'conductor', CASE WHEN v_servicio.assigned_driver_id IS NULL THEN NULL ELSE
      jsonb_build_object(
        'nombre', coalesce(nullif(btrim(v_driver.full_name), ''), 'Conductor'),
        -- Claves de la app: plate/brand/model/color (se deja «placa» como respaldo de datos viejos,
        -- regla de la 0050; esta versión la conserva tal cual).
        'placa', nullif(btrim(coalesce(v_driver.vehicle_data->>'plate', v_driver.vehicle_data->>'placa', '')), ''),
        'marca', nullif(btrim(coalesce(v_driver.vehicle_data->>'brand', '')), ''),
        'modelo', nullif(btrim(coalesce(v_driver.vehicle_data->>'model', '')), ''),
        'color', nullif(btrim(coalesce(v_driver.vehicle_data->>'color', '')), '')
      ) END,
    'marca', jsonb_build_object(
      'nombre', coalesce(
        nullif(btrim(coalesce(v_marca.nombre, '')), ''),
        nullif(btrim(coalesce(v_prov.vehicle_data->>'provider_name', '')), ''),
        v_corto,
        'WhatsRemisse'),
      'color_principal', coalesce(v_marca.color_principal, '#2D2D2D'),
      'color_secundario', coalesce(v_marca.color_secundario, '#9AA0A6'),
      'logo_url', v_marca.logo_url
    ),
    'actualizado_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seguimiento_del_viaje(TEXT) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.seguimiento_del_viaje(TEXT) TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.seguimiento_del_viaje(TEXT) TO anon;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
