-- ============================================
-- 0015: el puesto de postulante lo asigna la base
-- ============================================
-- Regla fijada con el usuario: el "Postulante N° X" es POR TARJETA y cuenta solo
-- las postulaciones VIGENTES (PENDING) de ese servicio. Se asigna al postular y se
-- recompone cuando un conductor ANULA su propia postulación (el que iba segundo
-- pasa a primero). El rechazo del PROVEEDOR NO recompone los puestos: los huecos
-- los cierra el próximo puesto que se asigne (1 + el mayor vigente), de modo que
-- nunca hay dos postulantes con el mismo número.
--
-- Por qué no puede hacerlo el cliente (es el bug que reportó el usuario):
--   * La política "Drivers manage own applications" (0001) es
--     FOR ALL USING (auth.uid() = driver_id): el conductor solo ve SUS filas, así
--     que su `count + 1` nunca supo cuántos postulantes había; dos conductores
--     podían ver el mismo número.
--   * Ese `count` tampoco filtraba por estado: las postulaciones anuladas
--     (REJECTED, la fila no se borra) seguían sumando, así que el primer
--     postulante de una alerta veía "N° 2" heredado de su intento anterior.
--
-- Qué hace esta migración:
--   1) Repara los datos ya guardados (números repetidos del cálculo viejo).
--   2) BEFORE INSERT/UPDATE: el puesto de una postulación vigente lo calcula la
--      base ignorando lo que mande el cliente, con la fila del servicio bloqueada
--      para que dos postulaciones simultáneas no puedan empatar.
--   3) AFTER UPDATE: cuando el propio conductor saca su postulación, los que
--      quedan se renumeran 1..n por orden de llegada.
--   4) Índice único parcial: dos postulaciones vigentes del mismo servicio no
--      pueden compartir número (garantía de la base, no del cliente).
--
-- En la app: `postularAServicio` (src/lib/database.ts) deja de mandar `order` y
-- hace upsert, así volver a postular tras anular reactiva la fila anterior y entra
-- al final de la cola. El número que se pinta es el que devuelve la base.

-- ============================================
-- 1) Datos existentes
-- ============================================
-- La marca hace que el trigger de asignación (si ya está creado, o sea: si esta
-- migración se vuelve a aplicar) no pise la renumeración fila por fila.
SELECT set_config('whatsremisse.renumerando', 'on', false);

WITH ordenadas AS (
  SELECT id, row_number() OVER (PARTITION BY service_id ORDER BY created_at, id) AS puesto
    FROM public.applications
   WHERE status = 'PENDING'
)
UPDATE public.applications a
   SET "order" = o.puesto::SMALLINT
  FROM ordenadas o
 WHERE a.id = o.id
   AND a."order" IS DISTINCT FROM o.puesto::SMALLINT;

SELECT set_config('whatsremisse.renumerando', 'off', false);

-- ============================================
-- 2) Asignación del puesto al postular
-- ============================================
CREATE OR REPLACE FUNCTION public.asignar_puesto_de_postulacion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_puesto INTEGER;
BEGIN
  -- Fuera de la cola el puesto no lo toca el cliente: una fila que ya existía
  -- conserva el suyo (histórico del proveedor) y un alta nueva arranca en 1.
  IF NEW.status <> 'PENDING' THEN
    IF TG_OP = 'UPDATE' THEN
      NEW."order" := OLD."order";
    ELSE
      NEW."order" := 1;
    END IF;
    RETURN NEW;
  END IF;

  -- Sigue en la cola (cambio de seen_by_driver, provider_chat_started...):
  -- conserva su puesto, salvo cuando viene de la renumeración, que ya trae el suyo.
  IF TG_OP = 'UPDATE' AND OLD.status = 'PENDING' THEN
    IF coalesce(current_setting('whatsremisse.renumerando', true), 'off') <> 'on' THEN
      NEW."order" := OLD."order";
    END IF;
    RETURN NEW;
  END IF;

  -- Alta (o vuelta a la cola tras anular): el puesto lo decide la base. El
  -- bloqueo de la fila del servicio serializa las postulaciones simultáneas.
  PERFORM 1 FROM public.service_alerts WHERE id = NEW.service_id FOR UPDATE;

  -- 1 + el mayor vigente (y nunca menos que la cantidad de vigentes): con solo
  -- contar, dos conductores podrían recibir el mismo número cuando el proveedor
  -- rechazó a alguien de en medio y dejó un hueco.
  SELECT 1 + greatest(count(*)::INTEGER, coalesce(max(a."order")::INTEGER, 0))
    INTO v_puesto
    FROM public.applications a
   WHERE a.service_id = NEW.service_id
     AND a.status = 'PENDING';

  NEW."order" := v_puesto::SMALLINT;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.asignar_puesto_de_postulacion() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.asignar_puesto_de_postulacion() TO authenticated;

-- ============================================
-- 3) Renumeración al anular (solo cuando anula el propio conductor)
-- ============================================
CREATE OR REPLACE FUNCTION public.renumerar_postulaciones_al_anular()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Si el que rechazó fue el proveedor (auth.uid() no es el dueño de la fila),
  -- los puestos NO se recomponen.
  IF auth.uid() IS DISTINCT FROM OLD.driver_id THEN
    RETURN NULL;
  END IF;

  -- La marca hace que el trigger de asignación no vuelva a fijar el puesto viejo.
  PERFORM set_config('whatsremisse.renumerando', 'on', true);

  -- Dos pasos a propósito: con el índice único, dos filas no pueden compartir
  -- número ni a mitad de la sentencia, así que primero se pasa a un rango que
  -- nadie ocupa (negativo) y después al puesto definitivo.
  UPDATE public.applications a
     SET "order" = (-1 * o.puesto)::SMALLINT
    FROM (
      SELECT a2.id, row_number() OVER (ORDER BY a2.created_at, a2.id) AS puesto
        FROM public.applications a2
       WHERE a2.service_id = NEW.service_id
         AND a2.status = 'PENDING'
    ) o
   WHERE a.id = o.id
     AND a."order" IS DISTINCT FROM (-1 * o.puesto)::SMALLINT;

  UPDATE public.applications a
     SET "order" = o.puesto::SMALLINT
    FROM (
      SELECT a2.id, row_number() OVER (ORDER BY a2.created_at, a2.id) AS puesto
        FROM public.applications a2
       WHERE a2.service_id = NEW.service_id
         AND a2.status = 'PENDING'
    ) o
   WHERE a.id = o.id
     AND a."order" IS DISTINCT FROM o.puesto::SMALLINT;

  PERFORM set_config('whatsremisse.renumerando', 'off', true);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.renumerar_postulaciones_al_anular() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.renumerar_postulaciones_al_anular() TO authenticated;

-- ============================================
-- 4) Triggers
-- ============================================
DROP TRIGGER IF EXISTS asignar_puesto_de_postulacion ON public.applications;
CREATE TRIGGER asignar_puesto_de_postulacion
  BEFORE INSERT OR UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.asignar_puesto_de_postulacion();

DROP TRIGGER IF EXISTS renumerar_postulaciones_al_anular ON public.applications;
CREATE TRIGGER renumerar_postulaciones_al_anular
  AFTER UPDATE ON public.applications
  FOR EACH ROW
  WHEN (OLD.status = 'PENDING' AND NEW.status <> 'PENDING')
  EXECUTE FUNCTION public.renumerar_postulaciones_al_anular();

-- ============================================
-- 5) Garantía de la base: un puesto vigente por servicio
-- ============================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_puesto_vigente_unico
  ON public.applications(service_id, "order")
  WHERE status = 'PENDING';

-- Comprobar el resultado:
--   SELECT service_id, "order", status, driver_id FROM public.applications
--    WHERE status = 'PENDING' ORDER BY service_id, "order";
--   -- No debe haber dos filas vigentes con el mismo (service_id, "order").
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.applications'::regclass
--     AND NOT tgisinternal;
