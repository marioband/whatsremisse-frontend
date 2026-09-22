-- 0041: servicios de EMERGENCIA.
--
-- Pedido del usuario (21-09-2026): «recibir alertas de grupos externos (Premium)» — «será un
-- servicio que brindaremos a los conductores para que puedan recibir servicios de emergencia de
-- grupos que no integran». Y, al preguntarle qué alertas entran, eligió: **solo las que el
-- proveedor marque como “emergencia” desde Nuevo servicio**, y **solo las que estén cerca de él**
-- (con su ubicación, como la distancia al origen que ya usa el inicio).
--
-- QUÉ AÑADE: una marca en el propio servicio. El proveedor decide, servicio por servicio, si quiere
-- que además de sus grupos lo puedan ver los conductores premium que estén cerca. Sin marcar, el
-- servicio se comporta EXACTAMENTE como hasta hoy (solo lo ven sus grupos).
--
-- NO HACE FALTA TOCAR LAS POLÍTICAS: la lectura de `service_alerts` para un conductor ya permite
-- los servicios `STATUS_OPEN` (0001, «Drivers view open or assigned services»), así que la app puede
-- leer las emergencias abiertas; el que decide si las MUESTRA es el filtro del conductor (premium,
-- activado y dentro del radio), que vive en la app.
--
-- ES OPCIONAL: sin esta migración la app funciona igual (los servicios se publican sin la marca y
-- nadie recibe emergencias de fuera de sus grupos).

BEGIN;

ALTER TABLE public.service_alerts
  ADD COLUMN IF NOT EXISTS emergencia BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.service_alerts.emergencia IS
  'Servicio marcado como emergencia por su proveedor (0041): los conductores premium cercanos pueden verlo aunque no esten en sus grupos.';

-- La consulta del conductor premium busca justo esto: emergencias abiertas.
CREATE INDEX IF NOT EXISTS idx_service_alerts_emergencia
  ON public.service_alerts(emergencia, status)
  WHERE emergencia;

COMMIT;

-- Comprobar después de aplicar:
--   SELECT emergencia, count(*) FROM public.service_alerts GROUP BY 1;
