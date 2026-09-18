-- ============================================
-- 0024: el pago, la fecha de pago, la observación y la unidad del servicio
-- ============================================
-- Síntoma que arregla (18-09-2026, reportado por el usuario): al crear un servicio, el
-- **tipo de pago**, la **fecha de pago**, la **observación** y el **tipo de unidad** que
-- eligió no se veían en la tarjeta: salían siempre los respaldos «BCP» y «Al término», sin
-- observación, y al volver a editar el servicio la unidad aparecía otra vez en «Todos».
-- En palabras del usuario: "pareciera que no está jalando la información del servicio y
-- esa parte se está comportando como una maqueta".
--
-- Por qué pasaba: el formulario (`CreateServiceScreen`) SÍ construye esos datos y los
-- manda al publicar (`payment_method`, `payment_term`, `observations`, `vehicle_type`),
-- pero **no existía ninguna columna donde guardarlos**. Comprobado contra el backend real:
--   GET /rest/v1/service_alerts?select=payment_method
--   -> 400 {"code":"42703","message":"column service_alerts.payment_method does not exist"}
-- PostgREST descarta las claves que no existen como columna (el INSERT no falla, pierde los
-- datos), así que la fila volvía sin ellos y la tarjeta caía en sus valores por defecto.
--
-- Esta migración crea las cuatro columnas. No toca políticas: las filas siguen protegidas
-- por las mismas políticas de `service_alerts` (el proveedor escribe lo suyo), las columnas
-- nuevas heredan ese control.
--
-- Aplicar desde el terminal del VPS con el rol DUEÑO de las tablas (no con `-U postgres`:
-- no es dueño y el ALTER falla con "must be owner of table service_alerts").

ALTER TABLE public.service_alerts ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE public.service_alerts ADD COLUMN IF NOT EXISTS payment_term TEXT;
ALTER TABLE public.service_alerts ADD COLUMN IF NOT EXISTS observations TEXT[];
ALTER TABLE public.service_alerts ADD COLUMN IF NOT EXISTS vehicle_type TEXT;

COMMENT ON COLUMN public.service_alerts.payment_method IS
  'Cómo se paga el servicio, tal como lo eligió el proveedor al publicarlo (BCP, Yape, Efectivo…); puede ser un texto libre del formulario.';
COMMENT ON COLUMN public.service_alerts.payment_term IS
  'Cuándo se paga (Al término, Al inicio…), tal como lo eligió el proveedor; puede ser un texto libre.';
COMMENT ON COLUMN public.service_alerts.observations IS
  'Aclaraciones del servicio que ve el conductor en la tarjeta (incluye las paradas intermedias que agrega la app).';
COMMENT ON COLUMN public.service_alerts.vehicle_type IS
  'Tipo de unidad pedida (Auto, Camioneta…); se usa al reabrir el formulario para editar.';

-- Comprobación rápida después de aplicar (debe devolver 4 filas):
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'service_alerts'
--      AND column_name IN ('payment_method','payment_term','observations','vehicle_type');
