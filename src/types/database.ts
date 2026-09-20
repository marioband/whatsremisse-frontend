export interface DbProfile {
  id: string;
  phone: string | null;
  role: 'GROUP_OWNER' | 'ADMIN' | 'PROVIDER' | 'DRIVER';
  full_name: string | null;
  tier: 'FREE' | 'PREMIUM' | null;
  subscription_expires_at: string | null;
  vehicle_data: Record<string, unknown> | null;
  license_data: Record<string, unknown> | null;
  yape_number: string | null;
  bcp_account: string | null;
  bcp_cci: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbServiceAlert {
  id: string;
  provider_id: string;
  group_id: string | null;
  title: string;
  description: string | null;
  origin_address: string;
  origin_lat: number | null;
  origin_lng: number | null;
  destination_address: string;
  destination_lat: number | null;
  destination_lng: number | null;
  /** Paradas en orden (0027). Puede no existir si la migración no está aplicada. */
  destinations?: string[] | null;
  vehicle_requirements: unknown | null;
  fare: number;
  status: string;
  assigned_driver_id: string | null;
  driver_progress_step: number;
  driver_started_at?: string | null;
  commission_paid: boolean;
  driver_payment_received: boolean;
  settlement_enabled: boolean;
  archived: boolean;
  provider_yape: string | null;
  provider_bcp_account: string | null;
  provider_bcp_cci: string | null;
  scheduled_at: string | null;
  // Pago, observaciones y unidad tal como los eligió el proveedor (migración 0024).
  // Opcionales: mientras la migración no esté aplicada la fila no las trae.
  payment_method?: string | null;
  payment_term?: string | null;
  observations?: string[] | null;
  vehicle_type?: string | null;
  // Pago entre conductor y proveedor (migración 0013)
  pago_estado: string;
  pago_direccion: string | null;
  pago_monto: number | null;
  pago_declarado_at: string | null;
  pago_aceptado_at: string | null;
  pago_aceptado_por: string | null;
  pago_confirmado_at: string | null;
  pago_confirmado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbApplication {
  id: string;
  service_id: string;
  driver_id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  order: number;
  provider_chat_started: boolean;
  seen_by_driver: boolean;
  created_at: string;
}

export interface DbGroup {
  id: string;
  name: string;
  owner_id: string;
  /** Foto del grupo (0038). Opcional: sin la migración llega `undefined` y el grupo va con inicial. */
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbGroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  favorite: boolean;
  joined_at: string; /** Silencio de los avisos de este grupo (0028). */
  muted?: boolean | null;
}

export interface DbMessage {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  type: 'TEXT' | 'SYSTEM' | 'VOICE' | 'PHOTO' | 'LOCATION' | 'CONTACT';
  /** Datos del adjunto (0026): `{ url }` en una foto, `{ lat, lng }` en una ubicación. */
  metadata?: Record<string, any> | null;
  created_at: string;
  /** Cuándo se editó (migración 0019). `NULL` = nunca se editó. */
  edited_at: string | null;
}

/** Fila de `service_messages` (migración 0010): chat 1 a 1 del servicio. */
export interface DbServiceMessage {
  id: string;
  service_id: string;
  driver_id: string;
  /** NULL = mensaje del sistema (hitos del viaje). */
  sender_id: string | null;
  content: string;
  type: 'TEXT' | 'SYSTEM' | 'VOICE' | 'PHOTO' | 'LOCATION' | 'CONTACT';
  metadata: Record<string, unknown>;
  created_at: string;
  /** Cuándo se editó (migración 0019). `NULL` = nunca se editó. */
  edited_at: string | null;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: DbProfile;
        Insert: Partial<DbProfile>;
        Update: Partial<DbProfile>;
      };
      service_alerts: {
        Row: DbServiceAlert;
        Insert: Partial<DbServiceAlert>;
        Update: Partial<DbServiceAlert>;
      };
      applications: {
        Row: DbApplication;
        Insert: Partial<DbApplication>;
        Update: Partial<DbApplication>;
      };
      groups: {
        Row: DbGroup;
        Insert: Partial<DbGroup>;
        Update: Partial<DbGroup>;
      };
      group_members: {
        Row: DbGroupMember;
        Insert: Partial<DbGroupMember>;
        Update: Partial<DbGroupMember>;
      };
      messages: {
        Row: DbMessage;
        Insert: Partial<DbMessage>;
        Update: Partial<DbMessage>;
      };
      service_messages: {
        Row: DbServiceMessage;
        Insert: Partial<DbServiceMessage>;
        Update: Partial<DbServiceMessage>;
      };
    };
  };
}
