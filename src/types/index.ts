export type AppRole = 'GROUP_OWNER' | 'ADMIN' | 'PROVIDER' | 'DRIVER';
export type SubscriptionTier = 'FREE' | 'PREMIUM';

export type ServiceStatus =
  | 'STATUS_OPEN'
  // 'STATUS_PENDING_APPROVAL' se quitó: era un estado inventado en memoria que no
  // existe en `service_alerts`. La alerta sigue `STATUS_OPEN` hasta que el proveedor
  // acepta a un conductor, y el conteo de postulantes sale de `applications`.
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
  /**
   * Las unidades. En `profiles.vehicle_data` (JSONB) es la lista de unidades del conductor
   * y en `service_alerts.vehicle_requirements` la lista que pide el servicio (19-09-2026).
   * Se acepta el texto viejo («Auto», «Todos») para no romper los datos ya guardados.
   */
  vehicle_type?: string | string[];
  brand?: string;
  model?: string;
  year?: number;
  color?: string;
  // Datos del conductor que viajan dentro de profiles.vehicle_data porque la
  // tabla no tiene columnas propias para ellos.
  dni?: string;
  first_name?: string;
  last_name?: string;
  provider_name?: string;
  driver_photo_url?: string;
  provider_photo_url?: string;
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
  yape_number?: string | null;
  bcp_account?: string | null;
  bcp_cci?: string | null;
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
  /**
   * Cuándo el conductor aceptado hizo el toque "Servicio aceptado, toca para iniciar"
   * (migración 0022). No es un hito: `driver_progress_step` sigue igual. Es la señal que
   * mueve la tarjeta de "Disponibles"/"Publicados" a "En proceso" en los DOS teléfonos
   * (antes el toque solo vivía en el dispositivo del conductor).
   */
  driver_started_at?: string | null;
  provider_name?: string;
  distance_meters?: number | null;
  archived?: boolean;
  // Campos para tarjeta de conductor
  company_name?: string;
  // `scheduled_at` es la hora real del servicio y de ahí sale el texto de la
  // tarjeta (`textoProgramado` en lib/datetime). El viejo `dispatch_type` se quitó:
  // nunca existió como columna, así que todas las tarjetas decían "Al momento".
  vehicle_type?: string;
  origin_estimate?: string;
  destination_estimate?: string;
  observations?: string[];
  payment_term?: string;
  payment_method?: string;
  // Fecha/hora programada del servicio (ISO 8601)
  scheduled_at?: string | null;
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
  // Pago entre conductor y proveedor (migración 0013): declaración del conductor,
  // aceptación del proveedor y confirmación de quien recibe el dinero.
  pago_estado?: 'SIN_DECLARAR' | 'DECLARADO' | 'RECHAZADO' | 'ACEPTADO' | 'CONFIRMADO';
  pago_direccion?: 'DRIVER_PAYS_PROVIDER' | 'PROVIDER_PAYS_DRIVER' | null;
  pago_monto?: number | null;
  pago_declarado_at?: string | null;
  pago_aceptado_at?: string | null;
  pago_aceptado_por?: string | null;
  pago_confirmado_at?: string | null;
  pago_confirmado_por?: string | null;
  /**
   * Grupos con los que está compartida la alerta (migración 0018): la lista
   * completa de `service_alert_groups`, en el orden en que se eligieron. `group_id`
   * es solo el principal. Llega en las lecturas de lista; si falta, vale `group_id`.
   */
  shared_group_ids?: string[];
}

export interface Application {
  serviceId: string;
  driverId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  order: number;
  providerChatStarted?: boolean;
  seenByDriver?: boolean;
  /**
   * Cuándo me postulé (ISO 8601). La app la refresca en cada postulación, así que
   * es la fecha de MI última postulación: sirve para saber si la alerta se volvió
   * a editar después (ver `rechazoVigente` en lib/listaDelConductor).
   */
  createdAt?: string;
}

export interface Message {
  id: string;
  service_alert_id: string;
  sender_id: string | null;
  content: string;
  type: 'TEXT' | 'SYSTEM' | 'VOICE' | 'PHOTO' | 'LOCATION' | 'CONTACT';
  metadata: Record<string, unknown>;
  created_at: string;
  sender_name?: string;
  /**
   * Cuándo se editó (migración 0019). `null` = el mensaje nunca se editó. El
   * texto anterior NO se guarda: la lista solo marca "editado".
   */
  edited_at?: string | null;
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
