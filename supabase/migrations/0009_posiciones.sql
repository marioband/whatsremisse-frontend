-- ============================================
-- 0009 · Posición del conductor para calcular distancias en la tarjeta de
--        postulantes (y otras medidas entre usuarios).
-- ============================================
--
-- Qué resuelve
-- ------------
-- El proveedor necesita ver a qué distancia y tiempo está cada postulante de su
-- punto de origen, con el formato "(2 min 1.3 km)". Eso necesita saber dónde está
-- el postulante, y hasta ahora la app no guardaba ninguna posición de nadie.
--
-- Reglas de ahorro y privacidad que aplica este diseño:
--   1. Cada dispositivo publica SU posición con `publish_my_position`, y lo hace
--      como mucho una vez cada 500 m o 5 minutos (lo decide la app). Aquí no hay
--      escrituras por cada lectura de GPS.
--   2. La posición se guarda redondeada a 3 decimales (~110 m). Para decidir si
--      un postulante está cerca sobra, y así no se almacena su dirección exacta.
--   3. Solo la lee el proveedor dueño del servicio, y solo de sus postulantes
--      pendientes, y solo si la posición es reciente (2 horas). No se expone en
--      `public_profile` ni en ningún listado general.
--   4. El cálculo de la distancia lo hace la app (cálculo propio primero; solo
--      después, si hace falta precisión, Routes API y con caché).
--
-- Aplicar en Supabase Studio > SQL Editor, o con:
--   psql "$DATABASE_URL" -f supabase/migrations/0009_posiciones.sql
-- Al final se recarga el cache de esquema de PostgREST para que las funciones
-- aparezcan de inmediato en /rest/v1/rpc/....

BEGIN;

-- ============================================
-- 1) Columnas de posición en profiles
-- ============================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_lat DOUBLE PRECISION;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_lng DOUBLE PRECISION;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.last_lat IS
  'Última latitud publicada por el propio dispositivo (redondeada a ~110 m).';
COMMENT ON COLUMN public.profiles.last_lng IS
  'Última longitud publicada por el propio dispositivo (redondeada a ~110 m).';
COMMENT ON COLUMN public.profiles.last_seen_at IS
  'Cuándo se publicó esa posición. Se considera vieja a las 2 horas.';

-- ============================================
-- 2) Publicar mi posición (solo la mía)
-- ============================================
-- Se hace por función y no por UPDATE directo para no depender de las políticas
-- de UPDATE de `profiles` y para que el redondeo sea siempre el mismo.
CREATE OR REPLACE FUNCTION public.publish_my_position(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa' USING ERRCODE = '28000';
  END IF;
  IF p_lat IS NULL OR p_lng IS NULL
     OR p_lat < -90 OR p_lat > 90 OR p_lng < -180 OR p_lng > 180 THEN
    RAISE EXCEPTION 'Coordenadas fuera de rango' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
     SET last_lat = round(p_lat::numeric, 3)::double precision,
         last_lng = round(p_lng::numeric, 3)::double precision,
         last_seen_at = now()
   WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.publish_my_position(DOUBLE PRECISION, DOUBLE PRECISION) FROM public;
GRANT EXECUTE ON FUNCTION public.publish_my_position(DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

-- ============================================
-- 3) Posiciones de los postulantes de MI servicio
-- ============================================
-- Devuelve solo los postulantes PENDIENTES de un servicio del que soy proveedor,
-- y solo si publicaron posición en las últimas 2 horas. Si no soy el proveedor,
-- la función no devuelve ninguna fila (ni siquiera dice si el servicio existe).
CREATE OR REPLACE FUNCTION public.service_applicant_positions(p_service_id UUID)
RETURNS TABLE (
  user_id UUID,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  seen_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id AS user_id,
    p.last_lat AS lat,
    p.last_lng AS lng,
    p.last_seen_at AS seen_at
  FROM public.applications a
  JOIN public.service_alerts sa ON sa.id = a.service_id
  JOIN public.profiles p ON p.id = a.driver_id
  WHERE a.service_id = p_service_id
    AND a.status = 'PENDING'
    AND auth.uid() IS NOT NULL
    AND sa.provider_id = auth.uid()
    AND p.last_lat IS NOT NULL
    AND p.last_lng IS NOT NULL
    AND p.last_seen_at IS NOT NULL
    AND p.last_seen_at > now() - INTERVAL '2 hours';
$$;

REVOKE ALL ON FUNCTION public.service_applicant_positions(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.service_applicant_positions(UUID) TO authenticated;

-- Índice para no recorrer `applications` entera al abrir la tarjeta.
CREATE INDEX IF NOT EXISTS idx_applications_service_status
  ON public.applications(service_id, status);

-- ============================================
-- 4) Recargar el cache de esquema de PostgREST
-- ============================================
NOTIFY pgrst, 'reload schema';

COMMIT;
