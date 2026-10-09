-- ============================================
-- 0050 — El seguimiento muestra los datos de la unidad (marca, modelo, color y placa)
-- ============================================
-- Pedido del usuario (09-10-2026): en la página del cliente, debajo del conductor, deben verse
-- **marca y modelo de la unidad, su color y su placa** (el nombre ya iba).
--
-- Y una corrección de fondo: la 0049 leía la placa de `vehicle_data->>'placa'`, pero la app
-- guarda las claves en inglés (`plate`, `brand`, `model`, `color`, `year` — ver
-- `src/types/index.ts` y `userProfileToPatch`). Con la clave equivocada, la placa de un viaje
-- REAL habría salido vacía (el demo la mostraba porque su fila de prueba usaba «placa»).
-- Se deja respaldo para las filas viejas que hayan guardado «placa».
--
-- Solo cambia la función pública `seguimiento_del_viaje` (nada más: ni tablas ni permisos).
-- Aplicar con (una línea, desde la carpeta `supabase`):
--   cat migrations/0050_seguimiento_con_datos_de_la_unidad.sql | docker exec -i supabase-db psql -U supabase_admin -d postgres

BEGIN;

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
  v_marca RECORD;
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

  SELECT m.* INTO v_marca FROM public.marcas_del_seguimiento m
   WHERE m.profile_id = v_servicio.provider_id;

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
        -- Claves de la app: plate/brand/model/color (se deja «placa» como respaldo de datos viejos).
        'placa', nullif(btrim(coalesce(v_driver.vehicle_data->>'plate', v_driver.vehicle_data->>'placa', '')), ''),
        'marca', nullif(btrim(coalesce(v_driver.vehicle_data->>'brand', '')), ''),
        'modelo', nullif(btrim(coalesce(v_driver.vehicle_data->>'model', '')), ''),
        'color', nullif(btrim(coalesce(v_driver.vehicle_data->>'color', '')), '')
      ) END,
    'marca', jsonb_build_object(
      'nombre', coalesce(nullif(btrim(coalesce(v_marca.nombre, '')), ''), 'WhatsRemisse'),
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
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.seguimiento_del_viaje(TEXT) TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.seguimiento_del_viaje(TEXT) TO authenticated;
  END IF;
END $$;

COMMENT ON FUNCTION public.seguimiento_del_viaje(TEXT) IS
  'Página pública del viaje (sin sesión): con el token devuelve solo lo del viaje. 0050: marca, modelo, color y placa de la unidad.';

NOTIFY pgrst, 'reload schema';

COMMIT;
