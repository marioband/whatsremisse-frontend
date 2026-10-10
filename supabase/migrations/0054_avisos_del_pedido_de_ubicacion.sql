-- 0054_avisos_del_pedido_de_ubicacion.sql
--
-- «VER UBICACIÓN»: LOS AVISOS AL TELÉFONO (10-10-2026).
--
-- Decisión del usuario (10-10-2026): sí a los DOS avisos, para que el pedido no se quede
-- esperando a que alguien mire la pantalla:
--   1) al CONDUCTOR, cuando el proveedor pide verlo en vivo → el aviso lleva al CHAT del
--      servicio, que es donde se responde («Compartir ubicación» o «Ahora no»);
--   2) al PROVEEDOR, cuando el conductor ACEPTA → el aviso lleva a la pantalla del mapa
--      (/ubicacion/<servicio>).
--
-- Usa la maquinaria de avisos que ya existe (0029/0036): `public.avisar(...)` apunta el aviso
-- en `avisos_cola` y el programa del VPS (`scripts/enviar-avisos.mjs`) lo entrega por Web Push.
-- Ventajas heredadas: si el destinatario está MIRANDO esa conversación, no le llega (el propio
-- `avisar` lo salta); un aviso no puede romper una escritura (atrapa sus propios errores).
--
-- Formato (0035): título = quién lo manda; cuerpo = contexto en una línea + qué hace el toque.
--
-- Se aplica con el rol DUEÑO (`supabase_admin`), después de la 0053. Es opcional: sin ella la
-- función de «Ver ubicación» sigue igual (sin aviso al teléfono).

BEGIN;

-- ============================================
-- 1) Al CONDUCTOR: «<Proveedor> quiere ver tu ubicación»
-- ============================================
CREATE OR REPLACE FUNCTION public.avisar_pedido_de_ubicacion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre TEXT;
BEGIN
  -- El nombre del proveedor, con la misma regla de las tarjetas: el configurado en su perfil
  -- (`vehicle_data.provider_name`) y, si no está, su primer nombre (nunca «Empresa»).
  SELECT coalesce(
           nullif(btrim(coalesce(p.vehicle_data->>'provider_name', '')), ''),
           nullif(split_part(coalesce(p.full_name, ''), ' ', 1), ''),
           'El proveedor')
    INTO v_nombre
    FROM public.profiles p
   WHERE p.id = new.proveedor_id;

  PERFORM public.avisar(
    array[new.conductor_id],
    coalesce(v_nombre, 'El proveedor'),
    'Pedido de ubicación' || E'\n' || 'Quiere ver tu viaje en vivo: toca para compartir tu ubicación o decir «Ahora no».',
    '/chat/' || new.service_id::text,
    'pedido-ubicacion-' || new.id::text
  );

  RETURN new;
END;
$$;
COMMENT ON FUNCTION public.avisar_pedido_de_ubicacion() IS
  'Avisa al CONDUCTOR cuando el proveedor le pide ver su ubicación en vivo (0053/0054).';

DROP TRIGGER IF EXISTS avisar_pedido_de_ubicacion ON public.pedidos_de_ubicacion;
CREATE TRIGGER avisar_pedido_de_ubicacion
AFTER INSERT ON public.pedidos_de_ubicacion
FOR EACH ROW
EXECUTE FUNCTION public.avisar_pedido_de_ubicacion();

-- ============================================
-- 2) Al PROVEEDOR: «<Conductor> está compartiendo su ubicación»
-- ============================================
CREATE OR REPLACE FUNCTION public.avisar_ubicacion_aceptada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre TEXT;
BEGIN
  SELECT split_part(coalesce(p.full_name, ''), ' ', 1)
    INTO v_nombre
    FROM public.profiles p
   WHERE p.id = new.conductor_id;

  PERFORM public.avisar(
    array[new.proveedor_id],
    coalesce(nullif(v_nombre, ''), 'El conductor'),
    'Ubicación en vivo' || E'\n' || 'El conductor está compartiendo su viaje: toca para verlo en el mapa.',
    '/ubicacion/' || new.service_id::text,
    'ubicacion-aceptada-' || new.service_id::text
  );

  RETURN new;
END;
$$;
COMMENT ON FUNCTION public.avisar_ubicacion_aceptada() IS
  'Avisa al PROVEEDOR cuando el conductor acepta compartir su ubicación (0053/0054).';

DROP TRIGGER IF EXISTS avisar_ubicacion_aceptada ON public.pedidos_de_ubicacion;
CREATE TRIGGER avisar_ubicacion_aceptada
AFTER UPDATE ON public.pedidos_de_ubicacion
FOR EACH ROW
WHEN (old.estado IS DISTINCT FROM new.estado AND new.estado = 'ACEPTADO')
EXECUTE FUNCTION public.avisar_ubicacion_aceptada();

REVOKE ALL ON FUNCTION public.avisar_pedido_de_ubicacion() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.avisar_ubicacion_aceptada() FROM PUBLIC;

COMMIT;

-- Comprobar después de aplicar:
--   SELECT destinatarios, titulo, cuerpo, url, etiqueta, creado_at
--     FROM public.avisos_cola ORDER BY creado_at DESC LIMIT 5;
