-- 0043_el_viaje_guardado_en_el_servicio.sql
--
-- EL VIAJE SE MIDE UNA VEZ Y SE GUARDA EN EL SERVICIO.
--
-- Acuerdo con el usuario (23-09-2026, recordado por él el 24-09): «el tramo origen → destino es fijo
-- para un servicio», así que se guardaba 30 días en caché. Pero esa caché vive en CADA TELÉFONO: si
-- la misma tarjeta la ven tres conductores, se le paga a Google la MISMA pregunta tres veces (y una
-- cuarta cuando entra un conductor nuevo). El gasto crecía con el número de conductores.
--
-- Con estas columnas el número viaja DENTRO del servicio, como la tarifa o el destino:
--   * el teléfono del proveedor lo mide UNA vez al publicar (y si edita las direcciones, otra vez);
--   * todos los demás teléfonos lo LEEN de la tarjeta: ni una consulta más.
--
-- Se guarda el texto ya formateado (lo que se enseña en la tarjeta) y también los números, por si
-- más adelante hay que recalcular la etiqueta o reordenar por duración.
--
-- NO hace falta tocar ninguna política: el proveedor ya puede escribir sus propios servicios y las
-- columnas son del servicio que él publica.
--
-- Se aplica con el rol DUEÑO (`supabase_admin`), después de la 0042. Es opcional: sin ella la app
-- funciona igual (cada teléfono mide el viaje por su cuenta, como hasta ahora).

BEGIN;

ALTER TABLE public.service_alerts
  ADD COLUMN IF NOT EXISTS viaje_estimacion TEXT;

ALTER TABLE public.service_alerts
  ADD COLUMN IF NOT EXISTS viaje_metros INTEGER;

ALTER TABLE public.service_alerts
  ADD COLUMN IF NOT EXISTS viaje_segundos INTEGER;

ALTER TABLE public.service_alerts
  ADD COLUMN IF NOT EXISTS viaje_medido_at TIMESTAMPTZ;

COMMENT ON COLUMN public.service_alerts.viaje_estimacion IS
  'El viaje origen->destino ya formateado ("25 min 12.3 km"), medido UNA vez por el proveedor (0043).';
COMMENT ON COLUMN public.service_alerts.viaje_metros IS
  'Distancia del viaje origen->destino en metros (0043).';
COMMENT ON COLUMN public.service_alerts.viaje_segundos IS
  'Duración del viaje origen->destino en segundos (0043).';
COMMENT ON COLUMN public.service_alerts.viaje_medido_at IS
  'Cuándo se midió ese viaje (0043): sirve para saber si el dato es del momento o de hace horas.';

COMMIT;

-- Comprobar después de aplicar:
--   SELECT title, viaje_estimacion, viaje_medido_at FROM public.service_alerts
--    WHERE viaje_estimacion IS NOT NULL ORDER BY viaje_medido_at DESC LIMIT 10;
