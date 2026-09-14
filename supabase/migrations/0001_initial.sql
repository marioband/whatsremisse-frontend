-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Perfiles de usuario (extiende auth.users de Supabase)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('GROUP_OWNER', 'ADMIN', 'PROVIDER', 'DRIVER')),
  full_name TEXT,
  vehicle_data JSONB,
  license_data JSONB,
  yape_number TEXT,
  bcp_account TEXT,
  bcp_cci TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Servicios / alertas
CREATE TABLE IF NOT EXISTS public.service_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id UUID,
  title TEXT NOT NULL,
  description TEXT,
  origin_address TEXT NOT NULL,
  origin_lat DOUBLE PRECISION,
  origin_lng DOUBLE PRECISION,
  destination_address TEXT NOT NULL,
  destination_lat DOUBLE PRECISION,
  destination_lng DOUBLE PRECISION,
  vehicle_requirements JSONB,
  fare NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'STATUS_OPEN' CHECK (status IN (
    'STATUS_OPEN',
    'STATUS_PENDING_APPROVAL',
    'STATUS_EN_ROUTE_ORIGIN',
    'STATUS_AT_ORIGIN',
    'STATUS_IN_PROGRESS',
    'STATUS_COMPLETED',
    'STATUS_CANCELLED'
  )),
  assigned_driver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  driver_progress_step SMALLINT NOT NULL DEFAULT 0,
  commission_paid BOOLEAN NOT NULL DEFAULT false,
  driver_payment_received BOOLEAN NOT NULL DEFAULT false,
  settlement_enabled BOOLEAN NOT NULL DEFAULT false,
  archived BOOLEAN NOT NULL DEFAULT false,
  provider_yape TEXT,
  provider_bcp_account TEXT,
  provider_bcp_cci TEXT,
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Postulaciones de conductores a servicios
CREATE TABLE IF NOT EXISTS public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES public.service_alerts(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  "order" SMALLINT NOT NULL DEFAULT 1,
  provider_chat_started BOOLEAN NOT NULL DEFAULT false,
  seen_by_driver BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(service_id, driver_id)
);

-- Indices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_service_alerts_provider_id ON public.service_alerts(provider_id);
CREATE INDEX IF NOT EXISTS idx_service_alerts_group_id ON public.service_alerts(group_id);
CREATE INDEX IF NOT EXISTS idx_service_alerts_status ON public.service_alerts(status);
CREATE INDEX IF NOT EXISTS idx_service_alerts_assigned_driver ON public.service_alerts(assigned_driver_id);
CREATE INDEX IF NOT EXISTS idx_applications_service_id ON public.applications(service_id);
CREATE INDEX IF NOT EXISTS idx_applications_driver_id ON public.applications(driver_id);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_service_alerts_updated_at
  BEFORE UPDATE ON public.service_alerts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================
-- Row Level Security (RLS)
-- ============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- Profiles: cada usuario ve/edita solo su perfil
CREATE POLICY "Profiles own read"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Profiles own update"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- service_alerts: proveedores gestionan sus servicios
CREATE POLICY "Providers manage own services"
  ON public.service_alerts FOR ALL
  USING (auth.uid() = provider_id)
  WITH CHECK (auth.uid() = provider_id);

-- service_alerts: conductores ven servicios abiertos o asignados a ellos
CREATE POLICY "Drivers view open or assigned services"
  ON public.service_alerts FOR SELECT
  USING (
    status = 'STATUS_OPEN'
    OR assigned_driver_id = auth.uid()
  );

-- applications: conductores gestionan sus postulaciones
CREATE POLICY "Drivers manage own applications"
  ON public.applications FOR ALL
  USING (auth.uid() = driver_id)
  WITH CHECK (auth.uid() = driver_id);

-- applications: proveedores ven y actualizan postulaciones de sus servicios
CREATE POLICY "Providers view service applications"
  ON public.applications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.service_alerts s
      WHERE s.id = applications.service_id AND s.provider_id = auth.uid()
    )
  );

CREATE POLICY "Providers update service applications"
  ON public.applications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.service_alerts s
      WHERE s.id = applications.service_id AND s.provider_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.service_alerts s
      WHERE s.id = applications.service_id AND s.provider_id = auth.uid()
    )
  );

-- Trigger para crear perfil automáticamente tras signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, phone, role)
  VALUES (NEW.id, NEW.phone, 'DRIVER')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
CREATE POLICY "Profiles own insert"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
