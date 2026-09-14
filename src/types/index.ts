export type AppRole = 'GROUP_OWNER' | 'ADMIN' | 'PROVIDER' | 'DRIVER';
export type SubscriptionTier = 'FREE' | 'PREMIUM';

export type ServiceStatus =
  | 'STATUS_OPEN'
  | 'STATUS_PENDING_APPROVAL'
  | 'STATUS_EN_ROUTE_ORIGIN'
  | 'STATUS_AT_ORIGIN'
  | 'STATUS_IN_PROGRESS'
  | 'STATUS_COMPLETED'
  | 'STATUS_CANCELLED';

export type PaymentStatus = 'PENDING' | 'CONFIRMED' | 'DISPUTED' | 'RESOLVED';

export interface VehicleData {
  plate?: string;
  max_weight?: number;
  cargo_volume?: number;
  vehicle_type?: string;
  brand?: string;
  model?: string;
  year?: number;
}

export interface LicenseData {
  number?: string;
  category?: string;
  expiry_date?: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: AppRole;
  group_id: string | null;
  tier: SubscriptionTier;
  subscription_expires_at: string | null;
  current_debt: number;
  vehicle_data: VehicleData | null;
  license_data: LicenseData | null;
  created_at: string;
  updated_at: string;
}

export interface Group {
  id: string;
  name: string;
  debt_threshold: number;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface ServiceAlert {
  id: string;
  provider_id: string;
  group_id: string;
  title: string;
  description: string | null;
  origin_address: string;
  origin_lat: number;
  origin_lng: number;
  destination_address: string;
  destination_lat: number;
  destination_lng: number;
  vehicle_requirements: VehicleData;
  fare: number;
  status: ServiceStatus;
  assigned_driver_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  provider_name?: string;
  distance_meters?: number | null;
  archived?: boolean;
  // Campos para tarjeta de conductor
  company_name?: string;
  dispatch_type?: string;
  vehicle_type?: string;
  origin_estimate?: string;
  destination_estimate?: string;
  observations?: string[];
  payment_term?: string;
  payment_method?: string;
  // Fecha/hora programada del servicio (ISO 8601)
  scheduled_at?: string;
  // Progreso del conductor en el slider de chat
  driver_progress_step?: number;
  // Estados de liquidación P2P
  commission_paid?: boolean;
  driver_payment_received?: boolean;
  settlement_enabled?: boolean;
  // Datos de pago del proveedor
  provider_yape?: string;
  provider_bcp_account?: string;
  provider_bcp_cci?: string;
}

export interface Application {
  serviceId: string;
  driverId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  order: number;
  providerChatStarted?: boolean;
  seenByDriver?: boolean;
}

export interface Message {
  id: string;
  service_alert_id: string;
  sender_id: string | null;
  content: string;
  type: 'TEXT' | 'SYSTEM' | 'VOICE';
  metadata: Record<string, unknown>;
  created_at: string;
  sender_name?: string;
}

export interface Payment {
  id: string;
  service_alert_id: string;
  driver_id: string;
  provider_id: string;
  amount: number;
  status: PaymentStatus;
  notes: string | null;
  reported_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
  created_at: string;
  confirmed_at: string | null;
  resolved_at: string | null;
}

export interface BlockedUser {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  dni: string;
  phone: string;
  brand: string;
  model: string;
  year: string;
  color: string;
  plate: string;
}

export interface GroupMembership {
  id: string;
  group_id: string;
  user_id: string;
  role: AppRole;
  invited_by: string | null;
  status: 'ACTIVE' | 'REMOVED';
  created_at: string;
  removed_at: string | null;
}
