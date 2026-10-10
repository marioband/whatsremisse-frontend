-- 0053_pedidos_de_ubicacion.sql
--
-- «VER UBICACIÓN»: EL PROVEEDOR PIDE VER AL CONDUCTOR EN VIVO.
--
-- Decisiones del usuario (10-10-2026, elegidas sobre las recomendaciones):
--   * el proveedor toca «Ver ubicación» en el pie de la tarjeta del chat → se crea el pedido;
--   * el conductor lo ve en la tarjeta (y con un aviso en su lista) y ACEPTA o dice «Ahora no»;
--   * aceptado, el proveedor ve el mapa en vivo dentro de la app (página /viaje/unidad/<token>);
--   * dura HASTA QUE EL VIAJE TERMINA; el conductor puede «Dejar de compartir» cuando quiera
--     y el proveedor lo ve;
--   * si el conductor está desconectado, el pedido CADUCA a los 10 minutos.
--
-- La posición es la MISMA que el teléfono del conductor ya publica cada 15 s durante un viaje
-- en curso (tabla `seguimiento_posiciones`, 0049). Aquí no se mueve ni se guarda nada nuevo:
-- el pedido es la PUERTA (el consentimiento) que abre esa lectura para el proveedor.
--
-- Se aplica con el rol DUEÑO (`supabase_admin`), después de la 0052. Es opcional: sin ella la
-- app funciona igual («Ver ubicación» simplemente no hace nada, como hasta hoy).

BEGIN;

-- ============================================
-- 1) Los pedidos de ubicación
-- ============================================
CREATE TABLE IF NOT EXISTS public.pedidos_de_ubicacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  service_id UUID NOT NULL REFERENCES public.service_alerts(id) ON DELETE CASCADE,
  proveedor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conductor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pedido_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '10 minutes',
  estado TEXT NOT NULL DEFAULT 'PEDIDO' CHECK (estado IN ('PEDIDO', 'ACEPTADO', 'RECHAZADO', 'CORTADO')),
  resuelto_at TIMESTAMPTZ
);

COMMENT ON TABLE public.pedidos_de_ubicacion IS
  'Pedidos del proveedor para ver al conductor en vivo (0053). Nadie la lee por la API: solo las funciones.';
COMMENT ON COLUMN public.pedidos_de_ubicacion.token IS
  'Cadena larga aleatoria: llave de /viaje/unidad/<token> (la pantalla del proveedor).';
COMMENT ON COLUMN public.pedidos_de_ubicacion.estado IS
  'PEDIDO → esperando al conductor; ACEPTADO → compartiendo; RECHAZADO / CORTADO → se acabó. CADUCADO se calcula al leer, no se guarda.';

CREATE INDEX IF NOT EXISTS idx_pedidos_ubicacion_servicio
  ON public.pedidos_de_ubicacion (service_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_ubicacion_conductor
  ON public.pedidos_de_ubicacion (conductor_id);

ALTER TABLE public.pedidos_de_ubicacion ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.pedidos_de_ubicacion FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.pedidos_de_ubicacion FROM anon;
  END IF;
END $$;

-- ============================================
-- 2) El estado EFECTIVO (un PEDIDO vencido es CADUCADO)
-- ============================================
CREATE OR REPLACE FUNCTION public.pedido_de_ubicacion_visible(p_estado TEXT, p_expira TIMESTAMPTZ)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT CASE WHEN p_estado = 'PEDIDO' AND p_expira <= now() THEN 'CADUCADO' ELSE p_estado END
$$;
COMMENT ON FUNCTION public.pedido_de_ubicacion_visible(TEXT, TIMESTAMPTZ) IS
  'Estado real de un pedido: el PEDIDO que pasó su minuto de espera se lee CADUCADO (0053).';

-- ============================================
-- 3) Crear el pedido (lo hace el PROVEEDOR)
-- ============================================
CREATE OR REPLACE FUNCTION public.pedido_de_ubicacion_crear(p_service_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_servicio RECORD;
  v_pedido RECORD;
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
    RAISE EXCEPTION 'Solo el proveedor del servicio puede pedir la ubicacion' USING ERRCODE = '42501';
  END IF;
  IF v_servicio.assigned_driver_id IS NULL THEN
    RAISE EXCEPTION 'El servicio todavia no tiene conductor asignado' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.seguimiento_visible(v_servicio.status, v_servicio.completed_at) THEN
    RAISE EXCEPTION 'El viaje no esta en curso' USING ERRCODE = 'P0001';
  END IF;

  -- Un pedido vivo se devuelve tal cual (idempotente: el boton puede repetirse sin ensuciar).
  SELECT * INTO v_pedido FROM public.pedidos_de_ubicacion p
   WHERE p.service_id = p_service_id
     AND (p.estado = 'ACEPTADO' OR (p.estado = 'PEDIDO' AND p.expira_at > now()))
   ORDER BY p.pedido_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', v_pedido.id, 'token', v_pedido.token, 'url', '/viaje/unidad/' || v_pedido.token,
      'estado', public.pedido_de_ubicacion_visible(v_pedido.estado, v_pedido.expira_at),
      'expira_at', v_pedido.expira_at, 'nuevo', FALSE);
  END IF;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO public.pedidos_de_ubicacion (token, service_id, proveedor_id, conductor_id)
  VALUES (v_token, p_service_id, v_uid, v_servicio.assigned_driver_id);

  RETURN jsonb_build_object(
    'id', (SELECT p.id FROM public.pedidos_de_ubicacion p WHERE p.token = v_token),
    'token', v_token, 'url', '/viaje/unidad/' || v_token,
    'estado', 'PEDIDO', 'expira_at', now() + interval '10 minutes', 'nuevo', TRUE);
END;
$$;
REVOKE ALL ON FUNCTION public.pedido_de_ubicacion_crear(UUID) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.pedido_de_ubicacion_crear(UUID) TO authenticated;
  END IF;
END $$;

-- ============================================
-- 4) Responder: aceptar o decir «Ahora no» (lo hace el CONDUCTOR)
-- ============================================
CREATE OR REPLACE FUNCTION public.pedido_de_ubicacion_responder(p_pedido_id UUID, p_aceptar BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_pedido RECORD;
  v_estado TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Necesitas iniciar sesion' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_pedido FROM public.pedidos_de_ubicacion p WHERE p.id = p_pedido_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ese pedido no existe' USING ERRCODE = 'P0002';
  END IF;
  IF v_pedido.conductor_id <> v_uid THEN
    RAISE EXCEPTION 'Solo el conductor al que se le pidio puede responder' USING ERRCODE = '42501';
  END IF;
  IF v_pedido.estado <> 'PEDIDO' THEN
    RAISE EXCEPTION 'Ese pedido ya fue respondido' USING ERRCODE = 'P0001';
  END IF;
  IF v_pedido.expira_at <= now() THEN
    RAISE EXCEPTION 'El pedido ya caduco: el proveedor tiene que pedirlo otra vez' USING ERRCODE = 'P0001';
  END IF;

  v_estado := CASE WHEN p_aceptar THEN 'ACEPTADO' ELSE 'RECHAZADO' END;
  UPDATE public.pedidos_de_ubicacion p
     SET estado = v_estado, resuelto_at = now()
   WHERE p.id = p_pedido_id;

  RETURN jsonb_build_object('id', p_pedido_id, 'estado', v_estado);
END;
$$;
REVOKE ALL ON FUNCTION public.pedido_de_ubicacion_responder(UUID, BOOLEAN) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.pedido_de_ubicacion_responder(UUID, BOOLEAN) TO authenticated;
  END IF;
END $$;

-- ============================================
-- 5) Dejar de compartir (el CONDUCTOR, cuando quiera)
-- ============================================
CREATE OR REPLACE FUNCTION public.pedido_de_ubicacion_cortar(p_pedido_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_pedido RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Necesitas iniciar sesion' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_pedido FROM public.pedidos_de_ubicacion p WHERE p.id = p_pedido_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ese pedido no existe' USING ERRCODE = 'P0002';
  END IF;
  IF v_pedido.conductor_id <> v_uid THEN
    RAISE EXCEPTION 'Solo el conductor puede dejar de compartir' USING ERRCODE = '42501';
  END IF;
  IF v_pedido.estado IN ('RECHAZADO', 'CORTADO') THEN
    RETURN jsonb_build_object('id', p_pedido_id, 'estado', v_pedido.estado);
  END IF;

  UPDATE public.pedidos_de_ubicacion p
     SET estado = 'CORTADO', resuelto_at = now()
   WHERE p.id = p_pedido_id;

  RETURN jsonb_build_object('id', p_pedido_id, 'estado', 'CORTADO');
END;
$$;
REVOKE ALL ON FUNCTION public.pedido_de_ubicacion_cortar(UUID) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.pedido_de_ubicacion_cortar(UUID) TO authenticated;
  END IF;
END $$;

-- ============================================
-- 6) El estado del pedido de un servicio (para las dos tarjetas)
-- ============================================
CREATE OR REPLACE FUNCTION public.pedido_de_ubicacion_del_servicio(p_service_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_servicio RECORD;
  v_pedido RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Necesitas iniciar sesion' USING ERRCODE = '28000';
  END IF;

  SELECT s.id, s.provider_id, s.assigned_driver_id INTO v_servicio
    FROM public.service_alerts s WHERE s.id = p_service_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_uid <> v_servicio.provider_id AND v_uid <> v_servicio.assigned_driver_id THEN
    RAISE EXCEPTION 'Solo el proveedor o el conductor de ese servicio pueden ver el pedido'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_pedido FROM public.pedidos_de_ubicacion p
   WHERE p.service_id = p_service_id
   ORDER BY p.pedido_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_pedido.id,
    'token', v_pedido.token,
    'estado', public.pedido_de_ubicacion_visible(v_pedido.estado, v_pedido.expira_at),
    'es_proveedor', (v_uid = v_pedido.proveedor_id),
    'pedido_at', v_pedido.pedido_at,
    'expira_at', v_pedido.expira_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.pedido_de_ubicacion_del_servicio(UUID) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.pedido_de_ubicacion_del_servicio(UUID) TO authenticated;
  END IF;
END $$;

-- ============================================
-- 7) ¿Qué servicios me están pidiendo la ubicación? (aviso en la lista del conductor)
-- ============================================
CREATE OR REPLACE FUNCTION public.pedidos_de_ubicacion_pendientes()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Necesitas iniciar sesion' USING ERRCODE = '28000';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(DISTINCT p.service_id)
      FROM public.pedidos_de_ubicacion p
     WHERE p.conductor_id = v_uid
       AND p.estado = 'PEDIDO'
       AND p.expira_at > now()
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.pedidos_de_ubicacion_pendientes() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.pedidos_de_ubicacion_pendientes() TO authenticated;
  END IF;
END $$;

-- ============================================
-- 8) La lectura PÚBLICA de la pantalla del proveedor (/viaje/unidad/<token>)
-- ============================================
CREATE OR REPLACE FUNCTION public.ubicacion_del_conductor(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pedido RECORD;
  v_pos RECORD;
  v_driver RECORD;
BEGIN
  SELECT * INTO v_pedido FROM public.pedidos_de_ubicacion p
   WHERE p.token = btrim(coalesce(p_token, ''));
  IF NOT FOUND THEN
    RETURN NULL;  -- token inexistente: ni una pista
  END IF;

  SELECT p.full_name, p.vehicle_data INTO v_driver
    FROM public.profiles p WHERE p.id = v_pedido.conductor_id;

  -- El conductor cortó: se devuelve su nombre y el aviso, sin posición (la página lo explica).
  IF v_pedido.estado = 'CORTADO' THEN
    RETURN jsonb_build_object(
      'estado', 'CORTADO',
      'conductor', jsonb_build_object(
        'nombre', coalesce(nullif(btrim(v_driver.full_name), ''), 'Conductor'),
        'placa', nullif(btrim(coalesce(v_driver.vehicle_data->>'plate', v_driver.vehicle_data->>'placa', '')), ''),
        'marca', nullif(btrim(coalesce(v_driver.vehicle_data->>'brand', '')), ''),
        'modelo', nullif(btrim(coalesce(v_driver.vehicle_data->>'model', '')), ''),
        'color', nullif(btrim(coalesce(v_driver.vehicle_data->>'color', '')), '')
      ),
      'posicion', NULL
    );
  END IF;

  -- Sin aceptar (o caducado) no hay nada que ver.
  IF public.pedido_de_ubicacion_visible(v_pedido.estado, v_pedido.expira_at) <> 'ACEPTADO' THEN
    RETURN NULL;
  END IF;

  SELECT sp.lat, sp.lng, sp.publicado_at INTO v_pos
    FROM public.seguimiento_posiciones sp WHERE sp.service_id = v_pedido.service_id;

  RETURN jsonb_build_object(
    'estado', 'ACEPTADO',
    'conductor', jsonb_build_object(
      'nombre', coalesce(nullif(btrim(v_driver.full_name), ''), 'Conductor'),
      'placa', nullif(btrim(coalesce(v_driver.vehicle_data->>'plate', v_driver.vehicle_data->>'placa', '')), ''),
      'marca', nullif(btrim(coalesce(v_driver.vehicle_data->>'brand', '')), ''),
      'modelo', nullif(btrim(coalesce(v_driver.vehicle_data->>'model', '')), ''),
      'color', nullif(btrim(coalesce(v_driver.vehicle_data->>'color', '')), '')
    ),
    'posicion', CASE WHEN v_pos.lat IS NULL THEN NULL ELSE
      jsonb_build_object('lat', v_pos.lat, 'lng', v_pos.lng, 'publicado_at', v_pos.publicado_at) END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.ubicacion_del_conductor(TEXT) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION public.ubicacion_del_conductor(TEXT) TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.ubicacion_del_conductor(TEXT) TO authenticated;
  END IF;
END $$;

COMMIT;

-- Comprobar después de aplicar:
--   SELECT estado, count(*) FROM public.pedidos_de_ubicacion GROUP BY estado;
--   SELECT public.ubicacion_del_conductor('una-prueba');  -- NULL si el token no existe
