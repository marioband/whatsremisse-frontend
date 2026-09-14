export interface DbProfile {
  id: string;
  phone: string | null;
  role: 'GROUP_OWNER' | 'ADMIN' | 'PROVIDER' | 'DRIVER';
  full_name: string | null;
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
  vehicle_requirements: unknown | null;
  fare: number;
  status: string;
  assigned_driver_id: string | null;
  driver_progress_step: number;
  commission_paid: boolean;
  driver_payment_received: boolean;
  settlement_enabled: boolean;
  archived: boolean;
  provider_yape: string | null;
  provider_bcp_account: string | null;
  provider_bcp_cci: string | null;
  scheduled_at: string | null;
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
  created_at: string;
  updated_at: string;
}

export interface DbGroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  favorite: boolean;
  joined_at: string;
}

export interface DbMessage {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  type: 'TEXT' | 'SYSTEM' | 'VOICE' | 'PHOTO' | 'LOCATION' | 'CONTACT';
  created_at: string;
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
    };
  };
}
