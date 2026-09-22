-- 0042_aviso_de_emergencias_cercanas.sql
--
-- Pedido del usuario (21-09-2026): «recibir alertas de grupos externos (Premium)» — «será un
-- servicio que brindaremos a los conductores para que puedan recibir servicios de emergencia de
-- grupos que no integran». Al preguntarle los detalles eligió:
--
--   * SOLO los servicios que el proveedor marque como emergencia (botón nuevo en Nuevo servicio).
--   * SOLO los que estén CERCA de él: hasta 15 km del punto de recogida, con su ubicación.
--   * Y que además LE SUENE EL TELÉFONO («así no tienen que estar mirando la lista»).
--
-- La parte de «ver la lista» la resuelve la app (0041 + Filtro conductor). ESTA migración resuelve
-- el aviso al teléfono, que solo puede hacerlo el servidor:
--
--   1) Cada conductor decide si quiere recibirlas: `profiles.recibir_emergencias` (por defecto NO).
--      Vive en la BASE y no solo en el teléfono, porque el aviso lo manda el servidor y no puede
--      ver lo que hay guardado en el teléfono.
--   2) Al publicar (o marcar después) un servicio como emergencia abierta, se avisa a los
--      conductores que: tienen la marca activada, son premium, publicaron su posición hace poco
--      (la app la publica sola) y están a menos de 15 km del origen. Nunca al proveedor.
--
-- UNA SOLA NOTIFICACIÓN POR SERVICIO: se usa la MISMA etiqueta que el aviso de grupo
-- («alerta-<servicio>»), que es lo que ya usa la 0030 para no repetir. Como el aviso de emergencia
-- sale al PUBLICAR y el de grupo al COMPARTIR (un momento después), un conductor que esté en el
-- grupo y además cerca recibe uno solo: el de emergencia, que es el texto correcto.
--
-- Se aplica con el rol DUEÑO (`supabase_admin`), después de la 0041.

BEGIN;

-- ============================================
-- 1) La preferencia del conductor
-- ============================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS recibir_emergencias BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.recibir_emergencias IS
  'El conductor quiere recibir avisos de servicios de EMERGENCIA cercanos, aunque no sean de sus grupos (0042).';

-- Para la consulta del disparador: quien la tenga puesta, sin recorrer toda la tabla.
CREATE INDEX IF NOT EXISTS idx_profiles_recibir_emergencias
  ON public.profiles(recibir_emergencias)
  WHERE recibir_emergencias;

-- ============================================
-- 2) Ayudantes
-- ============================================
-- Hoy todas las cuentas son PREMIUM (etapa de pruebas, 0008), así que esto no bloquea nada; queda
-- listo para cuando la membresía se cobre.
CREATE OR REPLACE FUNCTION public.tiene_premium(p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = p_uid
       AND p.tier = 'PREMIUM'
       AND (p.subscription_expires_at IS NULL OR p.subscription_expires_at > now())
  );
$$;

COMMENT ON FUNCTION public.tiene_premium(UUID) IS
  '¿La cuenta tiene membresía activa? (0042) Misma regla que usa la app: tier PREMIUM y sin vencer.';

-- Distancia en kilómetros entre dos puntos (línea recta, haversine). Misma cuenta que
-- `src/lib/emergencias.ts`: si se cambia una, hay que cambiar la otra.
CREATE OR REPLACE FUNCTION public.distancia_km(
  p_lat1 DOUBLE PRECISION,
  p_lng1 DOUBLE PRECISION,
  p_lat2 DOUBLE PRECISION,
  p_lng2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 2 * 6371 * asin(
    least(1, sqrt(
      power(sin(radians(p_lat2 - p_lat1) / 2), 2) +
      cos(radians(p_lat1)) * cos(radians(p_lat2)) *
      power(sin(radians(p_lng2 - p_lng1) / 2), 2)
    ))
  );
$$;

COMMENT ON FUNCTION public.distancia_km(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) IS
  'Distancia en km entre dos puntos (0042), igual que la regla de la app.';

-- ============================================
-- 3) El aviso
-- ============================================
CREATE OR REPLACE FUNCTION public.avisar_emergencia_cercana()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Radio de «cerca» (mismo número que RADIO_DE_EMERGENCIAS_KM en la app).
  radio CONSTANT DOUBLE PRECISION := 15;
  -- Una posición más vieja que esto ya no dice dónde está: no se avisa (evita avisos a quien
  -- apagó la app hace horas y está en otra ciudad).
  frescura CONSTANT INTERVAL := INTERVAL '45 minutes';
  etiqueta_del_servicio TEXT;
  destinatarios UUID[];
BEGIN
  -- Solo emergencias, solo abiertas, y solo cuando la marca APARECE (al publicar o al marcarla
  -- después): si se actualiza cualquier otra cosa, no se repite el aviso.
  IF NEW.emergencia IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> 'STATUS_OPEN' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.emergencia IS NOT DISTINCT FROM TRUE THEN
    RETURN NEW;
  END IF;
  IF NEW.origin_lat IS NULL OR NEW.origin_lng IS NULL THEN
    RETURN NEW;
  END IF;

  -- La misma etiqueta del aviso de grupo: así nadie recibe dos por el mismo servicio (0030).
  etiqueta_del_servicio := 'alerta-' || NEW.id::text;

  SELECT array_agg(DISTINCT p.id)
    INTO destinatarios
    FROM public.profiles p
   WHERE p.id <> NEW.provider_id
     AND p.recibir_emergencias IS TRUE
     AND public.tiene_premium(p.id)
     AND p.last_lat IS NOT NULL
     AND p.last_lng IS NOT NULL
     AND p.last_seen_at > now() - frescura
     AND public.distancia_km(p.last_lat, p.last_lng, NEW.origin_lat, NEW.origin_lng) <= radio
     -- Y nunca a quien ya tiene un aviso de ESTE servicio (por ejemplo, si lo republicara).
     AND NOT EXISTS (
       SELECT 1
         FROM public.avisos_cola c
        WHERE c.etiqueta = etiqueta_del_servicio
          AND p.id = ANY (c.destinatarios)
     );

  PERFORM public.avisar(
    destinatarios,
    'Emergencia cerca',
    coalesce(NEW.title, 'Hay un servicio de emergencia cerca de ti'),
    '/',
    etiqueta_del_servicio
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.avisar_emergencia_cercana() IS
  'Avisa al teléfono de una emergencia a los conductores premium que la pidieron y están a menos de 15 km (0042).';

DROP TRIGGER IF EXISTS avisar_emergencia_cercana ON public.service_alerts;
CREATE TRIGGER avisar_emergencia_cercana
  AFTER INSERT OR UPDATE OF emergencia, status ON public.service_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.avisar_emergencia_cercana();

COMMIT;

-- Comprobar después de aplicar:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'profiles' AND column_name = 'recibir_emergencias';
--   SELECT public.distancia_km(-12.0, -77.0, -12.1, -77.1);   -- ~14 km
--   SELECT count(*) FROM public.avisos_cola WHERE etiqueta LIKE 'alerta-%';
