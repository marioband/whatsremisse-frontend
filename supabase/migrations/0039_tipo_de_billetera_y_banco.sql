-- 0039: tipo de billetera y banco en los datos de pago.
--
-- Pedido del usuario (20-09-2026):
--   «En datos de pago debemos hacer modificaciones, ya que el apartado no deja elegir el tipo de
--    billetera ni el tipo de banco. Billeteras: Yape, Plin, Bim, Otro. Bancos: BCP, Interbank,
--    Scotiabank, Otro. Considera en tu diseño que banco tiene número de cuenta y CCI.»
--
-- QUÉ AÑADE (solo el «de qué»: los números ya tenían su sitio):
--   - `billetera_tipo`   : YAPE | PLIN | BIM | OTRO  (se guarda el código, no el rótulo).
--   - `billetera_nombre` : el nombre escrito cuando el tipo es OTRO.
--   - `banco_nombre`     : BCP | Interbank | Scotiabank, o el nombre escrito con OTRO: el banco
--                          se identifica por su nombre.
--
-- Los NÚMEROS siguen donde estaban (`yape_number` = número de la billetera, `bcp_account` =
-- número de cuenta, `bcp_cci` = CCI). No se renombran a propósito: las funciones autorizadas de
-- 0013/0014 lean de ahí y renombrarlas obligaría a recrearlas sin necesidad.
--
-- ES OPCIONAL: sin esta migración la app funciona igual (los datos de pago se guardan sin tipo y
-- las etiquetas del chat caen al rótulo genérico «Yape / Plin», «Cuenta bancaria»).

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS billetera_tipo TEXT,
  ADD COLUMN IF NOT EXISTS billetera_nombre TEXT,
  ADD COLUMN IF NOT EXISTS banco_nombre TEXT;

COMMENT ON COLUMN public.profiles.billetera_tipo IS
  'Codigo de la billetera de los datos de pago (0039): YAPE, PLIN, BIM u OTRO.';
COMMENT ON COLUMN public.profiles.billetera_nombre IS
  'Nombre de la billetera cuando billetera_tipo = OTRO (0039).';
COMMENT ON COLUMN public.profiles.banco_nombre IS
  'Banco de los datos de pago (0039): BCP, Interbank, Scotiabank o el nombre escrito con OTRO.';

-- ============================================
-- Las dos funciones autorizadas devuelven también el «de qué»
-- ============================================
-- Los tipos de retorno cambian (dos columnas nuevas), así que hay que soltar y recrear. Va TODO
-- dentro de la misma transacción (BEGIN arriba, COMMIT abajo): si algo fallara, la función vieja
-- sigue en pie en vez de quedarse el chat sin poder leer los datos de pago.

-- --- Datos del CONDUCTOR (0013): solo el proveedor del servicio y solo en el caso B ---
DROP FUNCTION IF EXISTS public.datos_de_pago_del_conductor(UUID);

CREATE OR REPLACE FUNCTION public.datos_de_pago_del_conductor(p_service_id UUID)
RETURNS TABLE (
  billetera_tipo TEXT,
  billetera_nombre TEXT,
  yape TEXT,
  banco_nombre TEXT,
  bcp_account TEXT,
  bcp_cci TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.service_alerts s
    WHERE s.id = p_service_id
      AND s.provider_id = auth.uid()
      AND s.pago_direccion = 'PROVIDER_PAYS_DRIVER'
      AND s.assigned_driver_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'No puedes ver los datos de pago del conductor de este servicio %', p_service_id;
  END IF;

  RETURN QUERY
    SELECT
      p.billetera_tipo,
      p.billetera_nombre,
      p.yape_number,
      p.banco_nombre,
      p.bcp_account,
      p.bcp_cci
    FROM public.profiles p
    JOIN public.service_alerts s ON s.assigned_driver_id = p.id
    WHERE s.id = p_service_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.datos_de_pago_del_conductor(UUID) TO authenticated;

-- --- Datos del PROVEEDOR (0014): las dos partes del servicio pueden leerlos ---
DROP FUNCTION IF EXISTS public.datos_de_pago_del_proveedor(UUID);

CREATE OR REPLACE FUNCTION public.datos_de_pago_del_proveedor(p_service_id UUID)
RETURNS TABLE (
  billetera_tipo TEXT,
  billetera_nombre TEXT,
  yape TEXT,
  banco_nombre TEXT,
  bcp_account TEXT,
  bcp_cci TEXT,
  nombre TEXT
)
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
    SELECT
      p.billetera_tipo,
      p.billetera_nombre,
      p.yape_number,
      p.banco_nombre,
      p.bcp_account,
      p.bcp_cci,
      p.full_name
    FROM public.profiles p
    WHERE p.id = fila.provider_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.datos_de_pago_del_proveedor(UUID) TO authenticated;

COMMIT;

-- Comprobar después de aplicar:
--   SELECT billetera_tipo, billetera_nombre, banco_nombre, yape_number, bcp_account, bcp_cci
--   FROM public.profiles WHERE id = auth.uid();
--   SELECT proname, pg_get_function_arguments(oid) FROM pg_proc WHERE proname LIKE 'datos_de_pago%';
