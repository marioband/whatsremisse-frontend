-- ============================================
-- 0017: el chat deja de estar abierto para una postulación rechazada
-- ============================================
-- Síntoma (usuario): "el proveedor conversa con el conductor, el proveedor lo
-- rechaza y el chat del conductor sigue disponible".
--
-- Causa: `is_service_driver` (0010) autoriza al conductor asignado Y a cualquiera
-- que tenga una fila en `applications` de ese servicio, **sin mirar el estado**.
-- Una postulación REJECTED seguía dando lectura y escritura sobre la conversación,
-- así que el conductor rechazado podía seguir escribiendo (y leer todo).
--
-- Regla: la conversación es de los participantes VIVOS —el conductor asignado o
-- una postulación vigente—. Al rechazar (o al perder el puesto frente a otro
-- conductor, que `approveApplicationInDb` marca REJECTED igual) el conductor sale
-- del chat; si vuelve a postularse, `postularAServicio` reactiva la MISMA fila en
-- PENDING y con ella vuelve el acceso, sin borrar nada.
--
-- Nota: la comprobación del conductor asignado va PRIMERO a propósito: si por
-- cualquier motivo el servicio quedara asignado a alguien con la fila en REJECTED,
-- el viaje en curso no se queda sin chat.

CREATE OR REPLACE FUNCTION public.is_service_driver(p_service_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.service_alerts s
    WHERE s.id = p_service_id AND s.assigned_driver_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.applications a
    WHERE a.service_id = p_service_id
      AND a.driver_id = auth.uid()
      AND a.status <> 'REJECTED'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_service_driver(UUID) TO authenticated;

-- Comprobar después de aplicar (con dos cuentas reales, la del proveedor y la del
-- conductor rechazado):
--   SELECT public.is_service_driver('<service_id>');  -- false tras el rechazo
--   SELECT count(*) FROM public.service_messages WHERE service_id = '<service_id>';
