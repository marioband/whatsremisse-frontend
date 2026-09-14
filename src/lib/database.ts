import { isSupabaseConfigured, supabase } from './supabase';
import { GroupItem, GroupMember } from '../context/MockStoreContext';
import { Application, ServiceAlert, ServiceStatus } from '../types';
import {
  DbApplication,
  DbServiceAlert,
  DbGroup,
  DbGroupMember,
  DbMessage,
} from '../types/database';

export interface ChatMessage {
  id: string;
  group_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  type: 'TEXT' | 'SYSTEM' | 'VOICE' | 'PHOTO' | 'LOCATION' | 'CONTACT';
  created_at: string;
}

export function mapServiceAlertFromDb(row: DbServiceAlert): ServiceAlert {
  return {
    id: row.id,
    provider_id: row.provider_id,
    group_id: row.group_id ?? '',
    title: row.title,
    description: row.description,
    origin_address: row.origin_address,
    origin_lat: row.origin_lat ?? 0,
    origin_lng: row.origin_lng ?? 0,
    destination_address: row.destination_address,
    destination_lat: row.destination_lat ?? 0,
    destination_lng: row.destination_lng ?? 0,
    vehicle_requirements: (row.vehicle_requirements as ServiceAlert['vehicle_requirements']) || {},
    fare: Number(row.fare),
    status: row.status as ServiceStatus,
    assigned_driver_id: row.assigned_driver_id,
    driver_progress_step: row.driver_progress_step ?? 0,
    commission_paid: row.commission_paid ?? false,
    driver_payment_received: row.driver_payment_received ?? false,
    settlement_enabled: row.settlement_enabled ?? false,
    archived: row.archived ?? false,
    provider_yape: row.provider_yape ?? undefined,
    provider_bcp_account: row.provider_bcp_account ?? undefined,
    provider_bcp_cci: row.provider_bcp_cci ?? undefined,
    scheduled_at: row.scheduled_at ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: null,
  };
}

export function mapApplicationFromDb(row: DbApplication): Application {
  return {
    serviceId: row.service_id,
    driverId: row.driver_id,
    status: row.status,
    order: row.order,
    providerChatStarted: row.provider_chat_started ?? false,
    seenByDriver: row.seen_by_driver ?? false,
  };
}

export function mapServiceAlertToDb(service: Partial<ServiceAlert>): Partial<DbServiceAlert> {
  const mapped: Partial<DbServiceAlert> = {};
  if (service.provider_id !== undefined) mapped.provider_id = service.provider_id;
  if (service.group_id !== undefined) mapped.group_id = service.group_id || null;
  if (service.title !== undefined) mapped.title = service.title;
  if (service.description !== undefined) mapped.description = service.description;
  if (service.origin_address !== undefined) mapped.origin_address = service.origin_address;
  if (service.origin_lat !== undefined) mapped.origin_lat = service.origin_lat;
  if (service.origin_lng !== undefined) mapped.origin_lng = service.origin_lng;
  if (service.destination_address !== undefined)
    mapped.destination_address = service.destination_address;
  if (service.destination_lat !== undefined) mapped.destination_lat = service.destination_lat;
  if (service.destination_lng !== undefined) mapped.destination_lng = service.destination_lng;
  if (service.vehicle_requirements !== undefined)
    mapped.vehicle_requirements = service.vehicle_requirements;
  if (service.fare !== undefined) mapped.fare = service.fare;
  if (service.status !== undefined) mapped.status = service.status;
  if (service.assigned_driver_id !== undefined)
    mapped.assigned_driver_id = service.assigned_driver_id;
  if (service.driver_progress_step !== undefined)
    mapped.driver_progress_step = service.driver_progress_step;
  if (service.commission_paid !== undefined) mapped.commission_paid = service.commission_paid;
  if (service.driver_payment_received !== undefined)
    mapped.driver_payment_received = service.driver_payment_received;
  if (service.settlement_enabled !== undefined)
    mapped.settlement_enabled = service.settlement_enabled;
  if (service.archived !== undefined) mapped.archived = service.archived;
  if (service.provider_yape !== undefined) mapped.provider_yape = service.provider_yape;
  if (service.provider_bcp_account !== undefined)
    mapped.provider_bcp_account = service.provider_bcp_account;
  if (service.provider_bcp_cci !== undefined) mapped.provider_bcp_cci = service.provider_bcp_cci;
  if (service.scheduled_at !== undefined) mapped.scheduled_at = service.scheduled_at;
  return mapped;
}

export async function insertServiceAlert(service: Partial<ServiceAlert>): Promise<ServiceAlert> {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured');
  const mapped = mapServiceAlertToDb(service);
  const { data, error } = await supabase.from('service_alerts').insert(mapped).select().single();
  if (error) throw error;
  return mapServiceAlertFromDb(data);
}

export async function fetchServicesForProvider(providerId: string): Promise<ServiceAlert[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('service_alerts')
    .select('*')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapServiceAlertFromDb);
}

export async function fetchServicesForDriver(driverId: string): Promise<ServiceAlert[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('service_alerts')
    .select('*')
    .or(`status.eq.STATUS_OPEN,assigned_driver_id.eq.${driverId}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapServiceAlertFromDb);
}

export async function fetchApplicationsForService(serviceId: string): Promise<Application[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .eq('service_id', serviceId)
    .order('order', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapApplicationFromDb);
}

export async function fetchApplicationsForDriver(driverId: string): Promise<Application[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapApplicationFromDb);
}

export async function insertApplication(serviceId: string, driverId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { count, error: countError } = await supabase
    .from('applications')
    .select('*', { count: 'exact', head: true })
    .eq('service_id', serviceId);
  if (countError) throw countError;

  const { error } = await supabase.from('applications').insert({
    service_id: serviceId,
    driver_id: driverId,
    status: 'PENDING',
    order: (count || 0) + 1,
  });
  if (error) throw error;
}

export async function approveApplicationInDb(serviceId: string, driverId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error: appError } = await supabase
    .from('applications')
    .update({ status: 'APPROVED' })
    .eq('service_id', serviceId)
    .eq('driver_id', driverId);
  if (appError) throw appError;

  const { error: rejectError } = await supabase
    .from('applications')
    .update({ status: 'REJECTED' })
    .eq('service_id', serviceId)
    .neq('driver_id', driverId);
  if (rejectError) throw rejectError;

  const { error: serviceError } = await supabase
    .from('service_alerts')
    .update({
      status: 'STATUS_AT_ORIGIN',
      assigned_driver_id: driverId,
      driver_progress_step: 0,
    })
    .eq('id', serviceId);
  if (serviceError) throw serviceError;
}

export async function rejectApplicationInDb(serviceId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error: appError } = await supabase
    .from('applications')
    .update({ status: 'REJECTED' })
    .eq('service_id', serviceId);
  if (appError) throw appError;

  const { error: serviceError } = await supabase
    .from('service_alerts')
    .update({ status: 'STATUS_OPEN', assigned_driver_id: null })
    .eq('id', serviceId);
  if (serviceError) throw serviceError;
}

export async function updateServiceAlert(
  serviceId: string,
  updates: Partial<ServiceAlert>
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from('service_alerts')
    .update(mapServiceAlertToDb(updates))
    .eq('id', serviceId);
  if (error) throw error;
}

export async function updateApplication(
  serviceId: string,
  driverId: string,
  updates: Partial<Application>
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const mapped: Partial<DbApplication> = {};
  if (updates.status !== undefined) mapped.status = updates.status;
  if (updates.providerChatStarted !== undefined)
    mapped.provider_chat_started = updates.providerChatStarted;
  if (updates.seenByDriver !== undefined) mapped.seen_by_driver = updates.seenByDriver;

  const { error } = await supabase
    .from('applications')
    .update(mapped)
    .eq('service_id', serviceId)
    .eq('driver_id', driverId);
  if (error) throw error;
}

export function mapGroupFromDb(row: DbGroup, memberRow?: DbGroupMember): GroupItem {
  return {
    id: row.id,
    name: row.name,
    role: (memberRow?.role as GroupItem['role']) || 'member',
    favorite: memberRow?.favorite || false,
  };
}

export function mapGroupMemberFromDb(row: DbGroupMember): GroupMember {
  return {
    id: row.user_id,
    groupId: row.group_id,
    name: row.user_id,
    role: (row.role as GroupMember['role']) || 'member',
  };
}

export function mapMessageFromDb(row: DbMessage): ChatMessage {
  return {
    id: row.id,
    group_id: row.group_id,
    sender_id: row.sender_id,
    sender_name: row.sender_id,
    content: row.content,
    type: row.type as ChatMessage['type'],
    created_at: row.created_at,
  };
}

export async function fetchGroupsForUser(userId: string): Promise<GroupItem[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('group_members')
    .select('group_id, role, favorite, groups(id, name, owner_id)')
    .eq('user_id', userId);
  if (error) throw error;

  return (data || [])
    .map((row: any) => {
      const group = row.groups as DbGroup;
      return mapGroupFromDb(group, {
        id: '',
        group_id: row.group_id,
        user_id: userId,
        role: row.role,
        favorite: row.favorite,
        joined_at: '',
      });
    })
    .filter((g): g is GroupItem => Boolean(g.id));
}

export async function fetchGroupMembers(groupId: string): Promise<GroupMember[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('group_members')
    .select('group_id, user_id, role, profiles(full_name)')
    .eq('group_id', groupId);
  if (error) throw error;
  return (data || []).map((row: any) => {
    const profile = row.profiles as { full_name: string | null } | null;
    return {
      id: row.user_id,
      groupId: row.group_id,
      name: profile?.full_name || row.user_id,
      role: row.role,
    };
  });
}

export async function insertGroup(
  name: string,
  ownerId: string
): Promise<{ group: DbGroup; member: DbGroupMember }> {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured');
  const { data: group, error: groupError } = await supabase
    .from('groups')
    .insert({ name, owner_id: ownerId })
    .select()
    .single();
  if (groupError) throw groupError;

  const { data: member, error: memberError } = await supabase
    .from('group_members')
    .insert({ group_id: group.id, user_id: ownerId, role: 'owner' })
    .select()
    .single();
  if (memberError) throw memberError;

  return { group, member };
}

export async function insertGroupMember(
  groupId: string,
  userId: string,
  role: 'admin' | 'member' = 'member'
): Promise<DbGroupMember> {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('group_members')
    .insert({ group_id: groupId, user_id: userId, role })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateGroupMember(
  groupId: string,
  userId: string,
  updates: Partial<Pick<DbGroupMember, 'role' | 'favorite'>>
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from('group_members')
    .update(updates)
    .eq('group_id', groupId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function fetchMessagesForGroup(groupId: string): Promise<ChatMessage[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('messages')
    .select('*, profiles(full_name)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map((row: any) => {
    const profile = row.profiles as { full_name: string | null } | null;
    return {
      id: row.id,
      group_id: row.group_id,
      sender_id: row.sender_id,
      sender_name: profile?.full_name || row.sender_id,
      content: row.content,
      type: row.type as ChatMessage['type'],
      created_at: row.created_at,
    };
  });
}

export async function insertMessage(
  groupId: string,
  senderId: string,
  content: string,
  type: ChatMessage['type'] = 'TEXT'
): Promise<ChatMessage> {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('messages')
    .insert({ group_id: groupId, sender_id: senderId, content, type })
    .select()
    .single();
  if (error) throw error;
  return mapMessageFromDb(data);
}

export interface SearchableProfile {
  id: string;
  phone: string | null;
  full_name: string | null;
  role: string | null;
}

export async function searchProfilesByPhone(query: string): Promise<SearchableProfile[]> {
  if (!isSupabaseConfigured) return [];
  const clean = query.replace(/\s/g, '');
  const { data, error } = await supabase
    .from('profiles')
    .select('id, phone, full_name, role')
    .ilike('phone', `%${clean}%`)
    .limit(20);
  if (error) throw error;
  return (data || []) as SearchableProfile[];
}

export interface PublicProfile {
  id: string;
  phone: string | null;
  full_name: string | null;
  role: string | null;
  vehicle_data: Record<string, unknown> | null;
}

export async function fetchProfileById(userId: string): Promise<PublicProfile | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, phone, full_name, role, vehicle_data')
    .eq('id', userId)
    .single();
  if (error) {
    console.error('[database] fetchProfileById error:', error);
    return null;
  }
  return data as PublicProfile;
}
