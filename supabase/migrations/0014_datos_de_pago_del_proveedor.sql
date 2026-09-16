-- ============================================
-- 0014: datos de pago del proveedor para el conductor del servicio
-- ============================================
-- Por qué existe: en el caso A ("Yo pago") quien debe pagar es el conductor y
-- quien recibe es el proveedor, así que el conductor necesita ver Yape/Plin,
-- cuenta y CCI del proveedor justo ahí, con opción de copiar. Pero 0003/0005
-- sacaron `yape_number` / `bcp_account` / `bcp_cci` de la lectura pública de
-- `profiles`, así que la única vía es una función autorizada.
--
-- Simetría con 0013 (`datos_de_pago_del_conductor`):
--   - Solo las dos partes del servicio pueden llamarla.
--   - Devuelve los datos del PROVEEDOR (nunca los del conductor: esos siguen
--     reservados al proveedor y solo cuando el conductor declaró "Me deben").
--   - El conductor puede llamarla desde el paso 1, antes de elegir la dirección
--     ("siempre visibles" según el flujo acordado).
--
-- Las columnas `provider_yape` / `provider_bcp_account` / `provider_bcp_cci` de
-- `service_alerts` quedan como respaldo histórico: nunca se escribieron, así que
-- los servicios ya publicados no las traen y por eso se leen en vivo desde aquí.

CREATE OR REPLACE FUNCTION public.datos_de_pago_del_proveedor(p_service_id UUID)
RETURNS TABLE (yape TEXT, bcp_account TEXT, bcp_cci TEXT, nombre TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fila public.service_alerts;
BEGIN
  SELECT s.* INTO fila
  FROM public.service_alerts s
  WHERE s.id = p_service_id;

  IF fila.id IS NULL THEN
    RAISE EXCEPTION 'Servicio inexistente: %', p_service_id;
  END IF;

  IF fila.provider_id <> auth.uid() AND fila.assigned_driver_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No participas en el servicio %', p_service_id;
  END IF;

  RETURN QUERY
    SELECT p.yape_number, p.bcp_account, p.bcp_cci, p.full_name
    FROM public.profiles p
    WHERE p.id = fila.provider_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.datos_de_pago_del_proveedor(UUID) TO authenticated;

-- Comprobar después de aplicar:
--   SELECT proname FROM pg_proc WHERE proname LIKE '%datos_de_pago%';
