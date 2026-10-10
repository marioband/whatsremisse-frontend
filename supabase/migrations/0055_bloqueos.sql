-- 0055_bloqueos.sql
--
-- «BLOQUEAR»: NO VERSE LAS ALERTAS ENTRE UN PROVEEDOR Y UN CONDUCTOR.
--
-- Decisiones del usuario (10-10-2026, corregidas sobre la propuesta):
--   * bloquear a un CONDUCTOR = ese conductor NO VE mis alertas de servicio;
--   * bloquear a un PROVEEDOR = YO no veo las alertas de ese proveedor;
--   * NO toca las postulaciones: no impide postularse ni esconde postulaciones — el bloqueo
--     es de VISIBILIDAD de alertas y nada más;
--   * los servicios EN CURSO no se tocan: con conductor ya asignado, la alerta sigue visible
--     para él (nadie queda colgado a mitad de un viaje).
--
-- Quien decide es la BASE (RLS de `service_alerts`), no la app: aunque el teléfono tenga una
-- tarjeta en caché, la consulta nueva ya no devuelve las alertas bloqueadas. La app además
-- filtra su lista con los ids bloqueados (cinturón y tirantes).
--
-- Las dos listas («Conductores bloqueados» / «Proveedores bloqueados») son de ORGANIZACIÓN:
-- el bloqueo vale en las DOS direcciones a la vez (entre ese par no se cruza ninguna alerta);
-- la columna `vista` recuerda desde qué lista se hizo, nada más.
--
-- La tabla no se toca por la API: la app entra SOLO por las funciones (mismo estilo que la
-- 0053). Se aplica con el rol DUEÑO (`supabase_admin`), después de la 0054. Es opcional: sin
-- ella la app funciona igual («Bloquear» simplemente no haría nada, como hasta hoy).

BEGIN;

-- ============================================
-- 1) La tabla de bloqueos
-- ============================================
CREATE TABLE IF NOT EXISTS public.bloqueos (
  bloqueador_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bloqueado_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vista TEXT NOT NULL CHECK (vista IN ('CONDUCTOR', 'PROVEEDOR')),
  creado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bloqueador_id, bloqueado_id),
  CONSTRAINT bloqueos_no_a_si_mismo CHECK (bloqueador_id <> bloqueado_id)
);

COMMENT ON TABLE public.bloqueos IS
  'Bloqueos entre cuentas (0055): entre el par no se cruzan alertas de servicio. Solo se lee y escribe por las funciones.';
COMMENT ON COLUMN public.bloqueos.vista IS
  'Desde qué lista se bloqueó (Conductores / Proveedores): es solo para ordenar las dos pantallas.';

CREATE INDEX IF NOT EXISTS idx_bloqueos_bloqueado
  ON public.bloqueos (bloqueado_id);

ALTER TABLE public.bloqueos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.bloqueos FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.bloqueos FROM anon;
  END IF;
END $$;

-- ============================================
-- 2) La decisión («¿estas dos cuentas están bloqueadas?»)
-- ============================================
-- SECURITY DEFINER: mira la tabla sin pasar por RLS (la política de `service_alerts` la
-- necesita para CUALQUIER par alerta↔conductor). El llamador tiene que ser una de las dos
-- cuentas: así nadie puede espiar pares ajenos preguntando por otros.
CREATE OR REPLACE FUNCTION public.alertas_bloqueadas(p_proveedor_id UUID, p_conductor_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bloqueos b
    WHERE (
        (b.bloqueador_id = p_proveedor_id AND b.bloqueado_id = p_conductor_id)
        OR (b.bloqueador_id = p_conductor_id AND b.bloqueado_id = p_proveedor_id)
      )
      AND (auth.uid() = p_proveedor_id OR auth.uid() = p_conductor_id)
  );
$$;

REVOKE ALL ON FUNCTION public.alertas_bloqueadas(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.alertas_bloqueadas(UUID, UUID) TO authenticated;

-- ============================================
-- 3) Lo que la app lee y escribe
-- ============================================
-- La lista de MIS bloqueos con el nombre y el teléfono (las columnas de siempre: nada de
-- datos de pago, igual que `search_profiles` de la 0003).
CREATE OR REPLACE FUNCTION public.mis_bloqueos()
RETURNS TABLE (id UUID, phone TEXT, full_name TEXT, vista TEXT, creado_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.id, p.phone, p.full_name, b.vista, b.creado_at
  FROM public.bloqueos b
  JOIN public.profiles p ON p.id = b.bloqueado_id
  WHERE b.bloqueador_id = auth.uid()
  ORDER BY b.creado_at DESC;
$$;

REVOKE ALL ON FUNCTION public.mis_bloqueos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mis_bloqueos() TO authenticated;

-- Bloquear: crea el bloqueo a MI nombre (el bloqueador siempre es quien llama).
CREATE OR REPLACE FUNCTION public.bloquear_usuario(p_bloqueado_id UUID, p_vista TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.bloqueos (bloqueador_id, bloqueado_id, vista)
  VALUES (auth.uid(), p_bloqueado_id, p_vista)
  ON CONFLICT (bloqueador_id, bloqueado_id) DO NOTHING;
$$;

REVOKE ALL ON FUNCTION public.bloquear_usuario(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bloquear_usuario(UUID, TEXT) TO authenticated;

-- Desbloquear: borra MI bloqueo de esa cuenta (si no es mío, no borra nada).
CREATE OR REPLACE FUNCTION public.desbloquear_usuario(p_bloqueado_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.bloqueos
  WHERE bloqueador_id = auth.uid() AND bloqueado_id = p_bloqueado_id;
$$;

REVOKE ALL ON FUNCTION public.desbloquear_usuario(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.desbloquear_usuario(UUID) TO authenticated;

-- ============================================
-- 4) La visibilidad de las alertas (la política del 0001, con el bloqueo dentro)
-- ============================================
-- Misma forma exacta del 0001 («Drivers view open or assigned services»), más una condición:
-- una alerta ABIERTA no se ve si entre su proveedor y quien mira hay un bloqueo (en cualquier
-- dirección). La rama del conductor asignado NO se toca: los servicios en curso siguen visibles.
DROP POLICY IF EXISTS "Drivers view open or assigned services" ON public.service_alerts;
CREATE POLICY "Drivers view open or assigned services"
  ON public.service_alerts FOR SELECT
  USING (
    (
      status = 'STATUS_OPEN'
      AND NOT public.alertas_bloqueadas(provider_id, auth.uid())
    )
    OR assigned_driver_id = auth.uid()
  );

COMMIT;
