import { describeError } from './errors';
import { displayName } from './names';
import { isSupabaseConfigured, supabase } from './supabase';
import { GroupItem, GroupMember } from '../context/MockStoreContext';
import { Application, ServiceAlert, ServiceStatus, VehicleData } from '../types';
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

/**
 * Servicios que puede ver un conductor: los que siguen abiertos y se
 * compartieron a alguno de sus grupos, mas los que ya tiene asignados. Nunca
 * los publicados por el mismo: esos viven en la pestana Proveedor.
 */
export async function fetchServicesForDriver(
  driverId: string,
  groupIds: string[] = []
): Promise<ServiceAlert[]> {
  if (!isSupabaseConfigured) return [];

  const rows: DbServiceAlert[] = [];

  const assigned = await supabase
    .from('service_alerts')
    .select('*')
    .eq('assigned_driver_id', driverId);
  if (assigned.error) throw assigned.error;
  rows.push(...((assigned.data || []) as DbServiceAlert[]));

  if (groupIds.length > 0) {
    const shared = await supabase
      .from('service_alerts')
      .select('*')
      .eq('status', 'STATUS_OPEN')
      .in('group_id', groupIds)
      .neq('provider_id', driverId);
    if (shared.error) throw shared.error;
    rows.push(...((shared.data || []) as DbServiceAlert[]));
  }

  const byId = new Map<string, ServiceAlert>();
  rows.forEach((row) => byId.set(row.id, mapServiceAlertFromDb(row)));

  return [...byId.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
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

/** Postulaciones recibidas en los servicios de un proveedor. */
export async function fetchApplicationsForProvider(serviceIds: string[]): Promise<Application[]> {
  if (!isSupabaseConfigured || serviceIds.length === 0) return [];
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .in('service_id', serviceIds)
    .order('order', { ascending: true });
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
    ownerId: row.owner_id,
  };
}

export function mapGroupMemberFromDb(row: DbGroupMember): GroupMember {
  return {
    id: row.user_id,
    groupId: row.group_id,
    // Nunca usar el user_id como nombre: la pantalla mostraría un UUID.
    name: displayName([(row as { full_name?: string | null }).full_name]),
    role: (row.role as GroupMember['role']) || 'member',
  };
}

export function mapMessageFromDb(row: DbMessage): ChatMessage {
  return {
    id: row.id,
    group_id: row.group_id,
    sender_id: row.sender_id,
    // Vacío a propósito: el user_id NO es un nombre. La pantalla resuelve el
    // nombre real con los integrantes del grupo (y nunca pinta un UUID).
    sender_name: '',
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

/** Fila que devuelve la RPC `group_member_profiles` (migración 0005). */
interface GroupMemberProfileRow {
  user_id: string;
  member_role: string | null;
  full_name: string | null;
  phone: string | null;
  profile_role: string | null;
  vehicle_data: Record<string, unknown> | null;
}

export async function fetchGroupMembers(groupId: string): Promise<GroupMember[]> {
  if (!isSupabaseConfigured) return [];

  // 1) RPC con alcance limitado (migración 0005). Es la única vía que funciona
  //    cuando la política de lectura de `profiles` solo deja ver la fila propia,
  //    que es justo el caso que hacía aparecer los UUID como nombres.
  try {
    const { data, error } = await supabase.rpc('group_member_profiles', {
      p_group_id: groupId,
    });
    if (error) throw error;
    const rows = (data || []) as GroupMemberProfileRow[];
    if (rows.length > 0) {
      return rows.map((row) => ({
        id: row.user_id,
        groupId,
        name: displayName([row.full_name], 'Integrante sin nombre'),
        role: (row.member_role as GroupMember['role']) || 'member',
        phone: row.phone ?? null,
        profileRole: row.profile_role ?? null,
        vehicleData: row.vehicle_data ?? null,
        // Hay fila de perfil si trajo nombre o teléfono; si ambos son NULL el
        // integrante todavía no completó sus datos en la app.
        profileFound: Boolean(row.full_name || row.phone),
      }));
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[database] RPC group_member_profiles no disponible, uso respaldo:', err);
  }

  // 2) Respaldo: embed de PostgREST (requiere política de lectura sobre
  //    `profiles` para las filas de otros usuarios).
  const { data, error } = await supabase
    .from('group_members')
    .select('group_id, user_id, role, profiles(full_name, phone)')
    .eq('group_id', groupId);
  if (error) throw error;
  return (data || []).map((row: any) => {
    const profile = row.profiles as { full_name: string | null; phone: string | null } | null;
    return {
      id: row.user_id,
      groupId: row.group_id,
      // Cadena de respaldo: nombre -> teléfono -> texto genérico. Nunca el UUID.
      name: displayName([profile?.full_name, profile?.phone], 'Integrante sin nombre'),
      role: row.role as GroupMember['role'],
      phone: profile?.phone ?? null,
      profileFound: Boolean(profile?.full_name || profile?.phone),
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

/**
 * Con RLS, un DELETE o un UPDATE que no toca ninguna fila NO es un error:
 * PostgREST responde 204 y el cliente cree que hizo el cambio. El síntoma es
 * "elimino al integrante, desaparece de la lista y al recargar la página vuelve".
 *
 * Arma el texto con lo que la base sí puede decirnos (tu rol en el grupo y quién
 * es el creador) para que el fallo diga la causa en vez de quedar mudo.
 */
async function describirBloqueoDeFila(
  groupId: string,
  accion: 'eliminar al integrante' | 'cambiar el rol'
): Promise<string> {
  const partes: string[] = [];
  try {
    const { data: sesion } = await supabase.auth.getSession();
    const uid = sesion?.session?.user?.id;
    if (uid) {
      const { data: miFila } = await supabase
        .from('group_members')
        .select('role')
        .eq('group_id', groupId)
        .eq('user_id', uid)
        .maybeSingle();
      partes.push(
        miFila
          ? `tu fila en group_members dice rol="${miFila.role}"`
          : 'no tienes fila en group_members para este grupo'
      );
    }
    const { data: grupo } = await supabase
      .from('groups')
      .select('owner_id')
      .eq('id', groupId)
      .maybeSingle();
    if (grupo?.owner_id) partes.push(`el creador del grupo es ${grupo.owner_id}`);
  } catch {
    // El diagnóstico es informativo: nunca debe tapar el error original.
  }

  return (
    `Supabase respondió OK pero la fila sigue en group_members, así que no se pudo ${accion}. ` +
    `Solo el creador del grupo o un Administrador pueden hacerlo (${partes.join('; ') || 'sin más datos'}). ` +
    'Aplica supabase/migrations/0006_group_member_delete_policy.sql en Supabase Studio > SQL Editor ' +
    '(deja borrar al creador del grupo aunque su fila de miembro falte o esté mal). Después comprueba con: ' +
    `select gm.user_id, gm.role from public.group_members gm where gm.group_id = '${groupId}';`
  );
}

export async function updateGroupMember(
  groupId: string,
  userId: string,
  updates: Partial<Pick<DbGroupMember, 'role' | 'favorite'>>
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { data, error } = await supabase
    .from('group_members')
    .update(updates)
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .select('user_id');
  if (error) throw error;
  if (!data || data.length === 0) {
    // El UPDATE no tocó ninguna fila: o la política lo filtró (RLS) o la fila no
    // existe. Los dos casos hay que decirlos, no tragarlos.
    throw new Error(await describirBloqueoDeFila(groupId, 'cambiar el rol'));
  }
}

export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { data, error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .select('user_id');
  if (error) throw error;

  // Con representación confirmamos el borrado. Si viene vacío, todavía hay que
  // distinguir "no borró nada" de "borró, pero no puedo leerlo".
  if (data && data.length > 0) return;

  const { count, error: countError } = await supabase
    .from('group_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('group_id', groupId)
    .eq('user_id', userId);
  if (countError) throw countError;
  if ((count ?? 0) === 0) return; // la fila ya no está: sí se eliminó

  throw new Error(await describirBloqueoDeFila(groupId, 'eliminar al integrante'));
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
      sender_name: displayName([profile?.full_name], ''),
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

/** Quita los caracteres que rompen la sintaxis de filtros de PostgREST (or=...). */
function sanitizeFilterValue(value: string): string {
  return value.replace(/[,()%*]/g, '').trim();
}

function normalizePhone(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '');
}

function matchesQuery(profile: SearchableProfile, rawQuery: string, digits: string): boolean {
  const name = (profile.full_name || '').toLowerCase();
  if (name.includes(rawQuery)) return true;
  const phoneDigits = normalizePhone(profile.phone);
  return digits.length >= 3 && phoneDigits.includes(digits);
}

/**
 * Busca usuarios por nombre o por teléfono (parcial, tolerante al formato:
 * +51, espacios, guiones). Primero filtra en el servidor y, si no hay
 * coincidencias, compara en el cliente sobre la primera página de perfiles.
 */
export async function searchProfiles(query: string, limit = 20): Promise<SearchableProfile[]> {
  if (!isSupabaseConfigured) return [];
  const raw = query.trim();
  if (raw.length < 3) return [];

  const digits = normalizePhone(raw);

  // 1) RPC `search_profiles` (migración 0003): busca por nombre o teléfono sin
  //    exponer el resto de columnas de profiles (datos de pago incluidos).
  try {
    const { data, error } = await supabase.rpc('search_profiles', {
      search: raw,
      max_rows: limit,
    });
    if (error) throw error;
    return (data || []) as SearchableProfile[];
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[database] RPC search_profiles no disponible, uso consulta directa:', err);
  }

  const safeRaw = sanitizeFilterValue(raw);
  const filters = new Set<string>();

  if (safeRaw) {
    filters.add(`full_name.ilike.%${safeRaw}%`);
    filters.add(`phone.ilike.%${safeRaw}%`);
  }
  if (digits.length >= 3) filters.add(`phone.ilike.%${digits}%`);

  if (filters.size > 0) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, phone, full_name, role')
        .or(Array.from(filters).join(','))
        .limit(limit);
      if (error) throw error;
      const rows = (data || []) as SearchableProfile[];
      if (rows.length > 0) return rows;
    } catch (err) {
      // Si el filtro del servidor falla (sintaxis de or=, permisos, etc.) no
      // abortamos la búsqueda: seguimos con la comparación en el cliente.
      // eslint-disable-next-line no-console
      console.warn('[database] searchProfiles server filter falló, uso respaldo:', err);
    }
  }

  // Respaldo: comparación tolerante al formato del teléfono guardado.
  const { data: page, error: pageError } = await supabase
    .from('profiles')
    .select('id, phone, full_name, role')
    .limit(200);
  if (pageError) throw pageError;

  return ((page || []) as SearchableProfile[])
    .filter((profile) => matchesQuery(profile, raw.toLowerCase(), digits))
    .slice(0, limit);
}

/**
 * Cuenta cuántos perfiles puede leer el usuario autenticado. Sirve para
 * distinguir "ese usuario no existe" de "RLS solo te deja ver tu propio
 * perfil" (política de lectura de `profiles` sin aplicar).
 */
export async function countVisibleProfiles(): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

export interface ProfilePatch {
  full_name?: string | null;
  phone?: string | null;
  role?: string | null;
  vehicle_data?: VehicleData | null;
  yape_number?: string | null;
  bcp_account?: string | null;
  bcp_cci?: string | null;
}

/**
 * Guarda (UPDATE) los datos del perfil del usuario autenticado en `profiles`.
 * Comprueba que realmente se haya actualizado una fila: con RLS, un UPDATE sin
 * permisos o sin fila devuelve 0 filas SIN lanzar error, y eso debe verse.
 */
export async function saveProfileData(userId: string, patch: ProfilePatch): Promise<void> {
  if (!isSupabaseConfigured) throw new Error('Supabase no está configurado en esta build.');
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(
      'Supabase no actualizó ninguna fila de profiles (revisa la sesión y la política RLS de UPDATE).'
    );
  }
}

export interface PublicProfile {
  id: string;
  phone: string | null;
  full_name: string | null;
  role: string | null;
  vehicle_data: Record<string, unknown> | null;
}

/** Resultado con diagnóstico: permite distinguir "sin permisos" de "sin datos". */
export interface PublicProfileResult {
  profile: PublicProfile | null;
  /** true solo si Supabase devolvió una fila (aunque sus campos estén vacíos). */
  found: boolean;
  source: 'rpc' | 'table' | 'none';
  /** Error crudo de Supabase, para mostrarlo en pantalla cuando no hay datos. */
  error: string | null;
}

/**
 * Lee el perfil público (nombre, teléfono, rol y vehículo) de otro usuario.
 *
 * Orden: RPC `public_profile` de la migración 0005 —que autoriza solo si
 * compartimos grupo o servicio— y, si no está instalada, la consulta directa
 * a `profiles` (que depende de la política de lectura vigente).
 *
 * Se usa `.maybeSingle()` en vez de `.single()`: con RLS, 0 filas no es un
 * error, y antes eso se confundía con un fallo de red.
 */
export async function fetchPublicProfile(userId: string): Promise<PublicProfileResult> {
  if (!isSupabaseConfigured) {
    return {
      profile: null,
      found: false,
      source: 'none',
      error: 'Supabase no está configurado en esta build.',
    };
  }

  let rpcError: string | null = null;
  try {
    const { data, error } = await supabase.rpc('public_profile', { p_user_id: userId });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as
      | {
          id: string;
          full_name: string | null;
          phone: string | null;
          profile_role: string | null;
          vehicle_data: Record<string, unknown> | null;
        }
      | null
      | undefined;
    if (row) {
      return {
        profile: {
          id: row.id,
          phone: row.phone ?? null,
          full_name: row.full_name ?? null,
          role: row.profile_role ?? null,
          vehicle_data: row.vehicle_data ?? null,
        },
        found: true,
        source: 'rpc',
        error: null,
      };
    }
  } catch (err) {
    rpcError = describeError(err);
    // eslint-disable-next-line no-console
    console.warn('[database] RPC public_profile no disponible, uso consulta directa:', err);
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, phone, full_name, role, vehicle_data')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    return { profile: null, found: false, source: 'none', error: describeError(error) };
  }
  if (!data) {
    return {
      profile: null,
      found: false,
      source: 'none',
      error: rpcError,
    };
  }
  return { profile: data as PublicProfile, found: true, source: 'table', error: null };
}

export async function fetchProfileById(userId: string): Promise<PublicProfile | null> {
  const result = await fetchPublicProfile(userId);
  return result.profile;
}
