-- ============================================
-- 0049 — Seguimiento del viaje para el cliente (servicio extra por proveedor)
-- ============================================
-- Pedido del usuario (25-09-2026): un servicio adicional para los proveedores que él active desde
-- el panel: el proveedor copia un link y su cliente ve, SIN CUENTA, el trayecto de origen a destino
-- con la unidad moviéndose (tipo Uber), desde que el viaje arranca hasta que termina y unos minutos
-- después. Con la marca de cada proveedor (colores y logo) configurada desde el panel.
--
-- Esta migración deja la BASE (la parte de servidor). Lo que trae:
--   1) `marcas_del_seguimiento`: el interruptor del servicio por cuenta + la marca (nombre, dos
--      colores, logo). El panel la edita (función al final).
--   2) `seguimientos_del_viaje`: los links (token largo, servicio, caducidad tope, revocación).
--   3) `seguimiento_posiciones`: la ÚLTIMA posición de la unidad por servicio (una fila), con su
--      propio límite de 12 s — separada de "cerca de ti" (0009), que sigue igual.
--   4) `service_alerts.trazo_polyline`: el trazo origen→destino (lo guardará la app al medir el
--      viaje: la MISMA llamada a Routes, un campo más en la máscara; no cuesta más en Google).
--   5) Funciones: `seguimiento_crear` y `seguimiento_revocar` (el proveedor), 
--      `publicar_posicion_del_seguimiento` (el conductor, cada ~15 s), la PÚBLICA
--      `seguimiento_del_viaje(token)` (anon, devuelve solo lo del viaje) y
--      `panel_marca_del_seguimiento` (el administrador, auditada).
--
-- Regla del link: vive mientras el viaje está EN CURSO y hasta 20 minutos después de completado;
-- revocado o vencido, la función pública no devuelve nada. El tope de `expira_at` (36 h) es una red
-- de seguridad por si un viaje se queda colgado.
--
-- Aplicar con (una línea, desde la carpeta `supabase`):
--   cat migrations/0049_seguimiento_del_viaje.sql | docker exec -i supabase-db psql -U supabase_admin -d postgres

BEGIN;

-- ============================================
-- 1) La marca de cada proveedor + el interruptor del servicio
-- ============================================
CREATE TABLE IF NOT EXISTS public.marcas_del_seguimiento (
  profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  nombre TEXT,
  color_principal TEXT NOT NULL DEFAULT '#2D2D2D',
  color_secundario TEXT NOT NULL DEFAULT '#9AA0A6',
  logo_url TEXT,
  actualizado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.marcas_del_seguimiento IS
  'Servicio extra de seguimiento por cuenta: fila = servicio activado; trae la marca del proveedor.';
COMMENT ON COLUMN public.marcas_del_seguimiento.activo IS
  'FALSE = el proveedor ya no puede crear links nuevos (los que existan siguen su vida normal).';
COMMENT ON COLUMN public.marcas_del_seguimiento.color_principal IS
  'Color de marca en #RRGGBB: cabecera, trazo y botones de la página del cliente.';
COMMENT ON COLUMN public.marcas_del_seguimiento.color_secundario IS
  'Segundo color en #RRGGBB: de él salen los grises del mapa (nunca pinta las calles).';

ALTER TABLE public.marcas_del_seguimiento ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.marcas_del_seguimiento FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.marcas_del_seguimiento FROM anon;
  END IF;
END $$;

-- ============================================
-- 2) Los links del seguimiento
-- ============================================
CREATE TABLE IF NOT EXISTS public.seguimientos_del_viaje (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  service_id UUID NOT NULL REFERENCES public.service_alerts(id) ON DELETE CASCADE,
  creado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  creado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_at TIMESTAMPTZ NOT NULL,
  revocado_at TIMESTAMPTZ,
  revocado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.seguimientos_del_viaje IS
  'Links públicos del viaje (whatsremisse.tech/viaje/<token>). Nadie la lee por la API: solo las funciones.';
COMMENT ON COLUMN public.seguimientos_del_viaje.token IS
  'Cadena larga aleatoria (64 hex). Es la llave del link: quien la tenga, ve el viaje.';
COMMENT ON COLUMN public.seguimientos_del_viaje.expira_at IS
  'Tope duro (36 h). La visibilidad real la decide el estado del viaje (+20 min tras completarlo).';

CREATE INDEX IF NOT EXISTS idx_seguimientos_servicio
  ON public.seguimientos_del_viaje (service_id);

ALTER TABLE public.seguimientos_del_viaje ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.seguimientos_del_viaje FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.seguimientos_del_viaje FROM anon;
  END IF;
END $$;

-- ============================================
-- 3) La última posición de la unidad (una fila por servicio)
-- ============================================
CREATE TABLE IF NOT EXISTS public.seguimiento_posiciones (
  service_id UUID PRIMARY KEY REFERENCES public.service_alerts(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  publicado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.seguimiento_posiciones IS
  'Última posición publicada por el conductor durante el viaje (redondeada a ~11 m). Solo la lee la función pública.';

ALTER TABLE public.seguimiento_posiciones ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.seguimiento_posiciones FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.seguimiento_posiciones FROM anon;
  END IF;
END $$;

-- ============================================
-- 4) El trazo origen→destino (lo guarda la app al medir el viaje)
-- ============================================
ALTER TABLE public.service_alerts ADD COLUMN IF NOT EXISTS trazo_polyline TEXT;
COMMENT ON COLUMN public.service_alerts.trazo_polyline IS
  'Trazo de la ruta en encodedPolyline (Routes API, en la MISMA medición del viaje). Lo dibuja la página del cliente.';

-- ============================================
-- 5) ¿El viaje se puede compartir ahora mismo?
-- ============================================
-- En curso = hay conductor asignado y no está abierto, cancelado ni completado. Después de
-- completado hay una ventana de 20 minutos (el cliente alcanza a ver el final).
CREATE OR REPLACE FUNCTION public.seguimiento_visible(p_status TEXT, p_completed_at TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN upper(coalesce(p_status, '')) = 'STATUS_COMPLETED' THEN
      p_completed_at IS NOT NULL AND p_completed_at > now() - interval '20 minutes'
    WHEN upper(coalesce(p_status, '')) IN ('STATUS_OPEN', 'STATUS_CANCELLED') THEN FALSE
    ELSE TRUE
  END;
$$;
REVOKE ALL ON FUNCTION public.seguimiento_visible(TEXT, TIMESTAMPTZ) FROM PUBLIC;

-- ============================================
-- 6) El proveedor: crear el link (idempotente) y revocarlo
-- ============================================
CREATE OR REPLACE FUNCTION public.seguimiento_crear(p_service_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_servicio RECORD;
  v_marca RECORD;
  v_link RECORD;
  v_token TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Necesitas iniciar sesion' USING ERRCODE = '28000';
  END IF;

  SELECT s.id, s.provider_id, s.status, s.assigned_driver_id, s.completed_at
    INTO v_servicio
    FROM public.service_alerts s WHERE s.id = p_service_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ese servicio no existe' USING ERRCODE = 'P0002';
  END IF;
  IF v_servicio.provider_id <> v_uid THEN
    RAISE EXCEPTION 'Solo el proveedor del servicio puede compartir el viaje' USING ERRCODE = '42501';
  END IF;

  SELECT m.* INTO v_marca FROM public.marcas_del_seguimiento m
   WHERE m.profile_id = v_uid AND m.activo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El seguimiento del viaje no esta activo para esta cuenta: pídelo al administrador'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.seguimiento_visible(v_servicio.status, v_servicio.completed_at) THEN
    RAISE EXCEPTION 'El viaje no esta en curso (se comparte desde que hay conductor hasta poco despues de terminar)'
      USING ERRCODE = 'P0001';
  END IF;

  -- Si ya hay un link vivo para este servicio, se devuelve el mismo: el botón siempre copia igual.
  SELECT l.* INTO v_link FROM public.seguimientos_del_viaje l
   WHERE l.service_id = p_service_id AND l.revocado_at IS NULL AND l.expira_at > now()
   ORDER BY l.creado_at DESC LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('token', v_link.token, 'url', '/viaje/' || v_link.token,
                              'expira_at', v_link.expira_at, 'nuevo', FALSE);
  END IF;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO public.seguimientos_del_viaje (token, service_id, creado_por, expira_at)
  VALUES (v_token, p_service_id, v_uid, now() + interval '36 hours');

  RETURN jsonb_build_object('token', v_token, 'url', '/viaje/' || v_token,
                            'expira_at', now() + interval '36 hours', 'nuevo', TRUE);
END;
$$;
REVOKE ALL ON FUNCTION public.seguimiento_crear(UUID) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.seguimiento_crear(UUID) TO authenticated;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.seguimiento_revocar(p_service_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_provider UUID;
  v_cuantos INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Necesitas iniciar sesion' USING ERRCODE = '28000';
  END IF;

  SELECT s.provider_id INTO v_provider FROM public.service_alerts s WHERE s.id = p_service_id;
  IF v_provider IS NULL THEN
    RAISE EXCEPTION 'Ese servicio no existe' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (v_provider = v_uid OR public.is_app_admin(v_uid)) THEN
    RAISE EXCEPTION 'Solo el proveedor del servicio (o un administrador) puede revocar el link'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.seguimientos_del_viaje
     SET revocado_at = now(), revocado_por = v_uid
   WHERE service_id = p_service_id AND revocado_at IS NULL;
  GET DIAGNOSTICS v_cuantos = ROW_COUNT;
  RETURN v_cuantos;
END;
$$;
REVOKE ALL ON FUNCTION public.seguimiento_revocar(UUID) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.seguimiento_revocar(UUID) TO authenticated;
  END IF;
END $$;

-- ============================================
-- 7) El conductor: publicar la posición durante el viaje (cada ~15 s)
-- ============================================
CREATE OR REPLACE FUNCTION public.publicar_posicion_del_seguimiento(
  p_service_id UUID,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_servicio RECORD;
  v_ultima TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No hay sesion activa' USING ERRCODE = '28000';
  END IF;

  SELECT s.assigned_driver_id, s.status, s.completed_at INTO v_servicio
    FROM public.service_alerts s WHERE s.id = p_service_id;
  IF NOT FOUND OR v_servicio.assigned_driver_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Solo el conductor asignado puede publicar la posicion de este viaje'
      USING ERRCODE = '42501';
  END IF;
  IF v_servicio.status = 'STATUS_COMPLETED' OR v_servicio.status = 'STATUS_CANCELLED'
     OR v_servicio.status = 'STATUS_OPEN' THEN
    RAISE EXCEPTION 'El viaje no esta en curso' USING ERRCODE = 'P0001';
  END IF;

  -- Su propio límite: lo que llegue antes de 12 s se ignora (la app publica cada 15 s). No toca
  -- el límite de 500 m / 5 min de "cerca de ti" (0009).
  SELECT sp.publicado_at INTO v_ultima FROM public.seguimiento_posiciones sp
   WHERE sp.service_id = p_service_id;
  IF v_ultima IS NOT NULL AND v_ultima > now() - interval '12 seconds' THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.seguimiento_posiciones (service_id, lat, lng, publicado_at)
  VALUES (p_service_id, round(p_lat::numeric, 4)::double precision,
          round(p_lng::numeric, 4)::double precision, now())
  ON CONFLICT (service_id) DO UPDATE
    SET lat = excluded.lat, lng = excluded.lng, publicado_at = excluded.publicado_at;

  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.publicar_posicion_del_seguimiento(UUID, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.publicar_posicion_del_seguimiento(UUID, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
  END IF;
END $$;

-- ============================================
-- 8) La función PÚBLICA (sin sesión): con el token, solo lo del viaje
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
        'placa', nullif(btrim(coalesce(v_driver.vehicle_data->>'placa', '')), '')
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

-- ============================================
-- 9) El panel: activar el servicio y editar la marca (auditado)
-- ============================================
CREATE OR REPLACE FUNCTION public.panel_marca_del_seguimiento(
  p_usuario UUID,
  p_activo BOOLEAN,
  p_nombre TEXT DEFAULT NULL,
  p_color_principal TEXT DEFAULT NULL,
  p_color_secundario TEXT DEFAULT NULL,
  p_logo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin UUID := public.panel_exige_admin();
  v_antes RECORD;
  v_nombre TEXT := nullif(btrim(coalesce(p_nombre, '')), '');
  v_principal TEXT := upper(nullif(btrim(coalesce(p_color_principal, '')), ''));
  v_secundario TEXT := upper(nullif(btrim(coalesce(p_color_secundario, '')), ''));
BEGIN
  IF v_principal IS NOT NULL AND v_principal !~ '^#[0-9A-F]{6}$' THEN
    RAISE EXCEPTION 'El color principal debe ser #RRGGBB' USING ERRCODE = '22023';
  END IF;
  IF v_secundario IS NOT NULL AND v_secundario !~ '^#[0-9A-F]{6}$' THEN
    RAISE EXCEPTION 'El color secundario debe ser #RRGGBB' USING ERRCODE = '22023';
  END IF;
  IF v_nombre IS NOT NULL AND length(v_nombre) > 40 THEN
    RAISE EXCEPTION 'El nombre de la marca no puede pasar de 40 caracteres' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_usuario) THEN
    RAISE EXCEPTION 'Esa cuenta no existe' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_antes FROM public.marcas_del_seguimiento m WHERE m.profile_id = p_usuario;

  INSERT INTO public.marcas_del_seguimiento
    (profile_id, activo, nombre, color_principal, color_secundario, logo_url, actualizado_at, actualizado_por)
  VALUES (
    p_usuario, coalesce(p_activo, TRUE), v_nombre,
    coalesce(v_principal, '#2D2D2D'), coalesce(v_secundario, '#9AA0A6'),
    nullif(btrim(coalesce(p_logo, '')), ''), now(), v_admin)
  ON CONFLICT (profile_id) DO UPDATE SET
    activo = coalesce(p_activo, public.marcas_del_seguimiento.activo),
    nombre = coalesce(v_nombre, public.marcas_del_seguimiento.nombre),
    color_principal = coalesce(v_principal, public.marcas_del_seguimiento.color_principal),
    color_secundario = coalesce(v_secundario, public.marcas_del_seguimiento.color_secundario),
    logo_url = coalesce(nullif(btrim(coalesce(p_logo, '')), ''), public.marcas_del_seguimiento.logo_url),
    actualizado_at = now(),
    actualizado_por = v_admin;

  PERFORM public.panel_anota(
    v_admin, 'SEGUIMIENTO_MARCA', p_usuario,
    jsonb_build_object(
      'activo', p_activo,
      'nombre', v_nombre,
      'color_principal', v_principal,
      'color_secundario', v_secundario,
      'logo', nullif(btrim(coalesce(p_logo, '')), ''),
      'antes', CASE WHEN v_antes.profile_id IS NULL THEN NULL ELSE
        jsonb_build_object('activo', v_antes.activo, 'nombre', v_antes.nombre,
                           'color_principal', v_antes.color_principal,
                           'color_secundario', v_antes.color_secundario) END
    )
  );

  RETURN (SELECT to_jsonb(m) FROM public.marcas_del_seguimiento m WHERE m.profile_id = p_usuario);
END;
$$;
REVOKE ALL ON FUNCTION public.panel_marca_del_seguimiento(UUID, BOOLEAN, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.panel_marca_del_seguimiento(UUID, BOOLEAN, TEXT, TEXT, TEXT, TEXT) TO authenticated;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
