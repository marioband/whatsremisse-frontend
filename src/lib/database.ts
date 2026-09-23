import { LIMITE_DE_EMERGENCIAS } from './emergencias';
import { describeError, esColumnaAusente, esFalloDeTransporte } from './errors';
import { conGrupos } from './gruposDeServicio';
import { displayName } from './names';
import type { LecturaDeChat } from './palomas';
import { isSupabaseConfigured, supabase } from './supabase';
import { GroupItem, GroupMember } from '../context/MockStoreContext';
import { Application, ServiceAlert, ServiceStatus, VehicleData } from '../types';
import {
  DbApplication,
  DbServiceAlert,
  DbGroup,
  DbGroupMember,
  DbMessage,
  DbServiceMessage,
} from '../types/database';

export interface ChatMessage {
  id: string;
  group_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  type: 'TEXT' | 'SYSTEM' | 'VOICE' | 'PHOTO' | 'LOCATION' | 'CONTACT';
  /**
   * Datos del adjunto (migración 0026): `{ url, ancho, alto }` en una foto y `{ lat, lng }`
   * en una ubicación. En `service_messages` existe desde la 0010.
   */
  metadata?: Record<string, any>;
  created_at: string;
  /** Cuándo se editó (migración 0019). `null` = nunca se editó. */
  edited_at: string | null;
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
    destinations: Array.isArray(row.destinations)
      ? row.destinations.map((parada) => String(parada))
      : undefined,
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
    // Sin la 0041 la columna no viene: la tarjeta se comporta como un servicio normal.
    emergencia: row.emergencia === true,
    provider_yape: row.provider_yape ?? undefined,
    provider_bcp_account: row.provider_bcp_account ?? undefined,
    provider_bcp_cci: row.provider_bcp_cci ?? undefined,
    // Pago entre conductor y proveedor (0013)
    pago_estado: (row.pago_estado || 'SIN_DECLARAR') as ServiceAlert['pago_estado'],
    pago_direccion: (row.pago_direccion || null) as ServiceAlert['pago_direccion'],
    pago_monto: row.pago_monto ?? null,
    pago_declarado_at: row.pago_declarado_at ?? null,
    pago_aceptado_at: row.pago_aceptado_at ?? null,
    pago_aceptado_por: row.pago_aceptado_por ?? null,
    pago_confirmado_at: row.pago_confirmado_at ?? null,
    pago_confirmado_por: row.pago_confirmado_por ?? null,
    scheduled_at: row.scheduled_at ?? undefined,
    // Pago, observaciones y unidad (0024): si la migración no está aplicada la fila no
    // trae las columnas, `row.*` es undefined y la tarjeta sigue con sus respaldos.
    payment_method: row.payment_method ?? undefined,
    payment_term: row.payment_term ?? undefined,
    observations: row.observations ?? undefined,
    vehicle_type: row.vehicle_type ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: null,
    driver_started_at: row.driver_started_at ?? null,
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
    // La app refresca `created_at` en cada postulación: es la fecha de mi ÚLTIMA
    // postulación y con ella se sabe si la alerta se editó después (ver
    // `rechazoVigente` en lib/listaDelConductor).
    createdAt: row.created_at ?? undefined,
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
  // Las paradas (0027). Sin la migración aplicada el INSERT/UPDATE falla por esta columna y se
  // reintenta sin ella (abajo): el servicio se guarda igual, sin las paradas.
  if (service.destinations !== undefined) mapped.destinations = service.destinations;
  // La emergencia (0041). Si falta la migración, el INSERT/UPDATE se reintenta sin ella.
  if (service.emergencia !== undefined) mapped.emergencia = service.emergencia;
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
  // Pago, observaciones y unidad (migración 0024). Sin esto el INSERT los descartaba y la
  // tarjeta mostraba los respaldos «BCP»/«Al término» (lo reportó el usuario el 18-09-2026).
  if (service.payment_method !== undefined) mapped.payment_method = service.payment_method;
  if (service.payment_term !== undefined) mapped.payment_term = service.payment_term;
  if (service.observations !== undefined) mapped.observations = service.observations;
  if (service.vehicle_type !== undefined) mapped.vehicle_type = service.vehicle_type;
  return mapped;
}

/** La columna que añade la 0027, para poder reintentar sin ella. */
function sinCamposDeLa0027(mapped: Partial<DbServiceAlert>): Partial<DbServiceAlert> {
  const copia = { ...mapped };
  delete copia.destinations;
  return copia;
}

/** La columna que añade la 0041 (emergencia), para poder reintentar sin ella. */
function sinCamposDeLa0041(mapped: Partial<DbServiceAlert>): Partial<DbServiceAlert> {
  const copia = { ...mapped };
  delete copia.emergencia;
  return copia;
}

/** Las columnas que añade la 0024, para poder reintentar sin ellas. */
function sinCamposDeLa0024(mapped: Partial<DbServiceAlert>): Partial<DbServiceAlert> {
  const copia = { ...mapped };
  delete copia.payment_method;
  delete copia.payment_term;
  delete copia.observations;
  delete copia.vehicle_type;
  return copia;
}

export async function insertServiceAlert(service: Partial<ServiceAlert>): Promise<ServiceAlert> {
  if (!isSupabaseConfigured) throw new Error('La app no está conectada a la base de datos.');
  const mapped = mapServiceAlertToDb(service);
  const { data, error } = await supabase.from('service_alerts').insert(mapped).select().single();
  if (!error) return mapServiceAlertFromDb(data);

  // Sin la 0024, el INSERT falla entero por las columnas que no existen: se reintenta sin
  // ellas para que el proveedor no se quede sin publicar (la tarjeta mostrará los
  // respaldos «BCP»/«Al término») y se avisa por consola de qué migración falta.
  if (!esColumnaAusente(error)) throw error;
  // Primero se prueba quitando solo las paradas (0027) y, si tampoco está la 0024, quitando las
  // dos familias de columnas: siempre queda guardado el servicio.
  let reintento = await supabase
    .from('service_alerts')
    .insert(sinCamposDeLa0027(mapped))
    .select()
    .single();
  if (reintento.error && esColumnaAusente(reintento.error)) {
    reintento = await supabase
      .from('service_alerts')
      .insert(sinCamposDeLa0024(sinCamposDeLa0027(mapped)))
      .select()
      .single();
    if (reintento.error) throw reintento.error;
    console.warn(
      '[database] el servicio se publicó sin pago, observaciones, unidad ni paradas: falta aplicar 0024_pago_y_observaciones_del_servicio.sql y 0027_paradas_del_servicio.sql'
    );
    return mapServiceAlertFromDb(reintento.data);
  }
  if (reintento.error) throw reintento.error;
  console.warn(
    '[database] el servicio se publicó sin las paradas: falta aplicar 0027_paradas_del_servicio.sql'
  );
  return mapServiceAlertFromDb(reintento.data);
}

// ---------------------------------------------------------------------------
// Grupos a los que está compartida una alerta (migración 0018)
// ---------------------------------------------------------------------------
// `service_alerts.group_id` es solo el grupo PRINCIPAL; la lista completa vive en
// `service_alert_groups`. Si la migración no está aplicada, la consulta falla con
// "tabla ausente" y se sigue con `group_id` (el comportamiento anterior), así que
// la app funciona igual: lo único que exige la 0018 es "Elegir grupos".

/** Grupos por servicio, en el orden en que los eligió el proveedor. */
export async function fetchGruposDeServicios(serviceIds: string[]): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>();
  if (!isSupabaseConfigured || serviceIds.length === 0) return mapa;

  const { data, error } = await supabase
    .from('service_alert_groups')
    .select('service_id, group_id, posicion')
    .in('service_id', serviceIds)
    .order('posicion', { ascending: true });
  if (error) {
    if (esTablaAusente(error)) return mapa;
    throw error;
  }

  ((data || []) as { service_id: string; group_id: string }[]).forEach((fila) => {
    const ids = mapa.get(fila.service_id) || [];
    ids.push(fila.group_id);
    mapa.set(fila.service_id, ids);
  });
  return mapa;
}

/** Lee los grupos de esas filas y se los pega (si la 0018 está aplicada). */
async function conSusGrupos(servicios: ServiceAlert[]): Promise<ServiceAlert[]> {
  if (servicios.length === 0) return servicios;
  try {
    const mapa = await fetchGruposDeServicios(servicios.map((s) => s.id));
    return servicios.map((servicio) => {
      const ids = mapa.get(servicio.id);
      return ids && ids.length > 0 ? conGrupos(servicio, ids) : servicio;
    });
  } catch (err) {
    console.warn('[database] no se pudieron leer los grupos del servicio:', err);
    return servicios;
  }
}

/**
 * Comparte (o deja de compartir, con un array vacío) una alerta con un conjunto de
 * grupos. La base valida que quien comparte sea el proveedor y que los grupos sean
 * suyos; reemplaza el conjunto completo, así que es idempotente.
 */
export async function compartirServicioConGrupos(
  serviceId: string,
  groupIds: string[]
): Promise<void> {
  if (!isSupabaseConfigured) throw new Error('Supabase no está configurado en esta build.');
  await conReintentoDeEsquema(async () => {
    const { error } = await supabase.rpc('compartir_servicio_con_grupos', {
      p_service_id: serviceId,
      p_group_ids: groupIds,
    });
    if (error) throw error;
    return true;
  });
}

export async function fetchServicesForProvider(providerId: string): Promise<ServiceAlert[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('service_alerts')
    .select('*')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return conSusGrupos((data || []).map(mapServiceAlertFromDb));
}

/**
 * Una sola fila de `service_alerts`, por id. La usa el chat del servicio para
 * refrescar el ciclo de pago (declaración → rechazo → confirmación) sin volver a
 * descargar todo el listado: el rechazo lo escribe el OTRO dispositivo y el
 * conductor no puede enterarse solo por el tiempo real.
 */
export async function fetchServiceAlertById(serviceId: string): Promise<ServiceAlert | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from('service_alerts')
    .select('*')
    .eq('id', serviceId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapServiceAlertFromDb(data as DbServiceAlert) : null;
}

/**
 * Servicios que puede ver un conductor: los que siguen abiertos y se
 * compartieron a alguno de sus grupos, mas los que ya tiene asignados. Nunca
 * los publicados por el mismo: esos viven en la pestana Proveedor.
 */
export async function fetchServicesForDriver(
  driverId: string,
  groupIds: string[] = [],
  /**
   * 0041/0042: traer TAMBIÉN las emergencias cercanas de grupos a los que el conductor no
   * pertenece. Solo se pide si tiene la marca activada y es premium (lo decide quien llama); el
   * «cerca de él» (15 km) se filtra después con su ubicación, en `lib/emergencias.ts`.
   */
  incluirEmergencias = false
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
    // Las alertas caducadas no se descargan siquiera: el conductor solo ve las que
    // puede tomar (su hora de inicio todavía no pasó). El proveedor las sigue
    // viendo en su lista para editarlas y reenviarlas.
    const shared = await supabase
      .from('service_alerts')
      .select('*')
      .eq('status', 'STATUS_OPEN')
      .in('group_id', groupIds)
      .neq('provider_id', driverId)
      .or(`scheduled_at.is.null,scheduled_at.gt.${new Date().toISOString()}`);
    if (shared.error) throw shared.error;
    rows.push(...((shared.data || []) as DbServiceAlert[]));

    // 0018: las compartidas a mis grupos cuyo grupo PRINCIPAL es otro. Sin la
    // migración aplicada esta consulta no encuentra la tabla y se sigue igual.
    const repartidas = await supabase
      .from('service_alert_groups')
      .select('service_id')
      .in('group_id', groupIds);
    if (repartidas.error) {
      if (!esTablaAusente(repartidas.error)) throw repartidas.error;
    } else {
      const yaVistos = new Set(rows.map((row) => row.id));
      const faltantes = [
        ...new Set(
          ((repartidas.data || []) as { service_id: string }[])
            .map((fila) => fila.service_id)
            .filter((id) => !yaVistos.has(id))
        ),
      ];
      if (faltantes.length > 0) {
        const extra = await supabase
          .from('service_alerts')
          .select('*')
          .eq('status', 'STATUS_OPEN')
          .in('id', faltantes)
          .neq('provider_id', driverId)
          .or(`scheduled_at.is.null,scheduled_at.gt.${new Date().toISOString()}`);
        if (extra.error) throw extra.error;
        rows.push(...((extra.data || []) as DbServiceAlert[]));
      }
    }
  }

  if (incluirEmergencias) {
    // Las emergencias abiertas de CUALQUIER grupo: la política de lectura de los conductores ya
    // permite los servicios abiertos (0001), así que no hace falta tocar nada en la base. Se traen
    // las últimas y la app decide cuáles están cerca.
    const emergencias = await supabase
      .from('service_alerts')
      .select('*')
      .eq('emergencia', true)
      .eq('status', 'STATUS_OPEN')
      .neq('provider_id', driverId)
      .order('created_at', { ascending: false })
      .limit(LIMITE_DE_EMERGENCIAS);
    if (emergencias.error) {
      if (!esColumnaAusente(emergencias.error)) throw emergencias.error;
      console.warn(
        '[database] no se pudieron leer las emergencias cercanas: falta aplicar 0041_servicios_de_emergencia.sql'
      );
    } else {
      const yaVistos = new Set(rows.map((fila) => fila.id));
      ((emergencias.data || []) as DbServiceAlert[]).forEach((fila) => {
        if (!yaVistos.has(fila.id)) rows.push(fila);
      });
    }
  }

  const byId = new Map<string, ServiceAlert>();
  rows.forEach((row) => byId.set(row.id, mapServiceAlertFromDb(row)));

  // Archivado propio del conductor (la bandera del servicio es del proveedor).
  try {
    const archivados = await fetchServiceArchivesForDriver(driverId);
    archivados.forEach((id) => {
      const service = byId.get(id);
      if (service) byId.set(id, { ...service, archived: true });
    });
  } catch (err) {
    // Sin la migración 0012 no hay tabla de archivado por conductor: se sigue sin ella.
    console.warn('[database] no se pudo leer el archivado del conductor:', err);
  }

  // Los grupos de cada alerta (0018): el conductor que está en varios grupos sigue
  // viendo UNA sola tarjeta.
  const servicios = await conSusGrupos([...byId.values()]);

  return servicios.sort(
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

/**
 * Postulación del conductor a una alerta.
 *
 * Devuelve la fila tal como quedó en la base, que es la ÚNICA que conoce el
 * puesto ("Postulante N° X"): lo asigna el trigger de la migración 0015 contando
 * las postulaciones VIGENTES del servicio. El cliente no puede calcularlo —la
 * política RLS de `applications` solo le deja ver sus propias filas—, y ese era
 * el bug: dos conductores podían ver el mismo número y un intento anterior
 * anulado dejaba al primero en "N° 2".
 *
 * Es un upsert a propósito: anular deja la fila en REJECTED, así que un INSERT
 * pelado chocaba con UNIQUE(service_id, driver_id) y el error se perdía en
 * consola (la tarjeta se pintaba como postulada sin postulación viva). Al
 * reactivar se refresca `created_at` para que el trigger lo ponga al final de la
 * cola, según la regla acordada con el usuario.
 */
export async function postularAServicio(
  serviceId: string,
  driverId: string
): Promise<Application | null> {
  if (!isSupabaseConfigured) return null;

  // Antes de escribir se mira el estado REAL en la base. Si el servicio ya tiene
  // conductor —o mi fila ya está APPROVED— NO se postula: el upsert de abajo devolvía
  // la fila a PENDING y dejaba al conductor aceptado con la tarjeta de "postulando" y
  // sin poder abrir el chat del viaje que ya estaba cubriendo (bug del 17-09-2026,
  // conductor 999888777). El teléfono puede no saber todavía que lo aceptaron: la
  // fuente de verdad es la base.
  const { data: servicio } = await supabase
    .from('service_alerts')
    .select('status, assigned_driver_id')
    .eq('id', serviceId)
    .maybeSingle();
  const { data: mia } = await supabase
    .from('applications')
    .select('*')
    .eq('service_id', serviceId)
    .eq('driver_id', driverId)
    .maybeSingle();
  const yaEstoyAceptado = mia?.status === 'APPROVED' && servicio?.assigned_driver_id === driverId;
  if (servicio?.assigned_driver_id || yaEstoyAceptado) {
    return mia ? mapApplicationFromDb(mia as unknown as DbApplication) : null;
  }
  const { data, error } = await supabase
    .from('applications')
    .upsert(
      {
        service_id: serviceId,
        driver_id: driverId,
        status: 'PENDING',
        created_at: new Date().toISOString(),
        seen_by_driver: false,
        provider_chat_started: false,
      },
      { onConflict: 'service_id,driver_id' }
    )
    .select()
    .maybeSingle();
  if (error) throw error;
  return data ? mapApplicationFromDb(data as unknown as DbApplication) : null;
}

export async function approveApplicationInDb(serviceId: string, driverId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  // Regla del proyecto: PostgREST contesta 204 / sin error aunque la política RLS no deje
  // tocar NINGUNA fila. Sin pedir las filas afectadas, el postulante quedaba aceptado en
  // pantalla (y el chat abierto) mientras en la base el servicio seguía sin conductor, y
  // todo volvía atrás al recargar. Se piden las filas y se comprueba que el cambio llegó.
  const { data: aprobadas, error: appError } = await supabase
    .from('applications')
    .update({ status: 'APPROVED' })
    .eq('service_id', serviceId)
    .eq('driver_id', driverId)
    .select('id');
  if (appError) throw appError;
  if (!aprobadas || aprobadas.length === 0) {
    throw new Error('La postulación no se pudo aceptar: la base no cambió ninguna fila.');
  }

  // Cero filas aquí SÍ es legítimo (puede ser el único postulante), así que solo se mira el error.
  const { error: rejectError } = await supabase
    .from('applications')
    .update({ status: 'REJECTED' })
    .eq('service_id', serviceId)
    .neq('driver_id', driverId);
  if (rejectError) throw rejectError;

  const { data: asignados, error: serviceError } = await supabase
    .from('service_alerts')
    .update({
      status: 'STATUS_AT_ORIGIN',
      assigned_driver_id: driverId,
      driver_progress_step: 0,
    })
    .eq('id', serviceId)
    .select('id');
  if (serviceError) throw serviceError;
  if (!asignados || asignados.length === 0) {
    throw new Error('El servicio no se pudo asignar al conductor: la base no cambió ninguna fila.');
  }
}

export async function rejectApplicationInDb(serviceId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error: appError } = await supabase
    .from('applications')
    .update({ status: 'REJECTED' })
    .eq('service_id', serviceId);
  if (appError) throw appError;

  const { data: reabiertos, error: serviceError } = await supabase
    .from('service_alerts')
    .update({ status: 'STATUS_OPEN', assigned_driver_id: null })
    .eq('id', serviceId)
    .select('id');
  if (serviceError) throw serviceError;
  if (!reabiertos || reabiertos.length === 0) {
    throw new Error('El servicio no se pudo reabrir: la base no cambió ninguna fila.');
  }
}

/**
 * Rechaza la postulación de UN conductor concreto.
 *
 * `rejectApplicationInDb` rechaza TODAS las postulaciones del servicio (y lo
 * reabre): eso está bien cuando el proveedor descarta el servicio entero, pero no
 * cuando solo quiere sacar a un postulante de la lista, que es el caso de la
 * tarjeta de postulantes.
 */
export async function rejectApplicationFromDb(serviceId: string, driverId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { data, error } = await supabase
    .from('applications')
    .update({ status: 'REJECTED' })
    .eq('service_id', serviceId)
    .eq('driver_id', driverId)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(
      'Supabase no actualizó ninguna fila de applications (revisa la sesión y la política RLS de UPDATE).'
    );
  }
}

export async function updateServiceAlert(
  serviceId: string,
  updates: Partial<ServiceAlert>
): Promise<ServiceAlert | null> {
  if (!isSupabaseConfigured) return null;
  const mapped = mapServiceAlertToDb(updates);
  let { data, error } = await supabase
    .from('service_alerts')
    .update(mapped)
    .eq('id', serviceId)
    .select();
  // Igual que al publicar: sin la 0024 aplicada el UPDATE falla por las columnas que no
  // existen, así que se reintenta sin ellas (el resto del cambio sí se guarda).
  if (error && esColumnaAusente(error)) {
    let reintento = await supabase
      .from('service_alerts')
      .update(sinCamposDeLa0027(mapped))
      .eq('id', serviceId)
      .select();
    if (reintento.error && esColumnaAusente(reintento.error)) {
      reintento = await supabase
        .from('service_alerts')
        .update(sinCamposDeLa0024(sinCamposDeLa0027(mapped)))
        .eq('id', serviceId)
        .select();
    }
    data = reintento.data;
    error = reintento.error;
  }
  if (error) throw error;

  const fila = (data || [])[0];
  // Con RLS, un UPDATE que no toca ninguna fila NO es un error: PostgREST
  // responde 204 y el cliente cree que guardó (así se perdía en silencio el
  // reporte del conductor y el cambio "reaparecía" al recargar).
  if (!fila) {
    throw new Error(
      'La base no cambió el servicio: o no tienes permiso de escritura sobre él o ya no existe. ' +
        'El proveedor escribe su propio servicio; el conductor reporta con las funciones de la ' +
        'migración 0012 (reportar_progreso_servicio / marcar_hito_de_pago).'
    );
  }
  return mapServiceAlertFromDb(fila as DbServiceAlert);
}

/**
 * Reintenta una llamada cuando el error es "no encuentro la función": eso pasa
 * cuando la migración acaba de aplicarse y PostgREST todavía no recargó su
 * esquema. Un segundo intento (con una pausa corta) lo resuelve sin molestar al
 * usuario con un aviso que no es su problema.
 */
async function conReintentoDeEsquema<T>(llamada: () => Promise<T>, intentos = 2): Promise<T> {
  let ultimoError: unknown;
  for (let intento = 0; intento < intentos; intento += 1) {
    try {
      return await llamada();
    } catch (err) {
      ultimoError = err;
      if (!esFuncionAusente(err)) throw err;
      await new Promise((resolver) => setTimeout(resolver, 1500));
    }
  }
  throw ultimoError;
}

/**
 * Confirmar el pago recibido, a prueba de un fallo de transporte (19-09-2026).
 *
 * El usuario lo reportó así: «al intentar por primera vez hacer clic en confirmar pago salió
 * No se pudo confirmar el pago / El backend rechazó la confirmación / No hubo respuesta del
 * servidor». La RPC existe y responde (comprobado contra el backend: contesta su propia regla
 * `P0001`), así que lo que falló fue la RED en ese primer toque — el caso típico de iPhone al
 * volver del fondo, cuando Safari revive la pestaña y la petición muere.
 *
 * Qué se hace, en este orden:
 *  1. Se confirma.
 *  2. Si el fallo es de TRANSPORTE (no hay respuesta, no hay error de la base), **primero se
 *     lee la fila**: la escritura pudo haber llegado igualmente y el pago ya estaría
 *     confirmado. Es la regla del proyecto con los fallos de transporte (ver `lib/errors.ts`).
 *  3. Si no llegó, se reintenta UNA vez; solo entonces se avisa del error.
 */
export async function confirmarPagoDelServicio(serviceId: string): Promise<ServiceAlert | null> {
  if (!isSupabaseConfigured) return null;
  const confirmar = () =>
    conReintentoDeEsquema(async () => {
      const { data: fila, error } = await supabase.rpc('confirmar_pago_recibido', {
        p_service_id: serviceId,
      });
      if (error) throw error;
      return fila;
    });

  try {
    return aFilaDeRpc(await confirmar());
  } catch (err) {
    if (!esFalloDeTransporte(err)) throw err;
    const enLaBase = await fetchServiceAlertById(serviceId).catch(() => null);
    if (enLaBase && enLaBase.pago_estado === 'CONFIRMADO') return enLaBase;
    return aFilaDeRpc(await confirmar());
  }
}

/**
 * Reporte del conductor (migración 0012). El conductor no puede escribir la fila
 * de `service_alerts` (RLS: solo el proveedor), así que su avance se guarda con
 * esta función, que valida que él sea el conductor asignado y que el paso no
 * retroceda. Devuelve la fila ya actualizada (fuente de verdad para la UI).
 */
export async function reportarProgresoDelConductor(
  serviceId: string,
  paso: number
): Promise<ServiceAlert | null> {
  if (!isSupabaseConfigured) return null;
  const data = await conReintentoDeEsquema(async () => {
    const { data: fila, error } = await supabase.rpc('reportar_progreso_servicio', {
      p_service_id: serviceId,
      p_paso: paso,
    });
    if (error) throw error;
    return fila;
  });
  return data ? mapServiceAlertFromDb(data as DbServiceAlert) : null;
}

/**
 * El toque "Servicio aceptado, toca para iniciar" del conductor (migración 0022).
 *
 * El conductor no puede escribir `service_alerts` (RLS: solo el proveedor), así que el
 * toque se guarda con esta función, que valida que él sea el conductor asignado y deja la
 * marca una sola vez. NO toca `driver_progress_step` ni el estado: el toque no es un hito
 * (el primer hito lo reporta el conductor al deslizar la barra dentro del chat).
 */
export async function marcarArranqueDelViaje(serviceId: string): Promise<ServiceAlert | null> {
  if (!isSupabaseConfigured) return null;
  const data = await conReintentoDeEsquema(async () => {
    const { data: fila, error } = await supabase.rpc('iniciar_viaje_del_servicio', {
      p_service_id: serviceId,
    });
    if (error) throw error;
    return fila;
  });
  return data ? mapServiceAlertFromDb(data as DbServiceAlert) : null;
}

/** Comisión entregada / pago recibido, marcados por el conductor (0012). */
export async function marcarHitoDePagoDelConductor(
  serviceId: string,
  hito: 'comision' | 'pago'
): Promise<ServiceAlert | null> {
  if (!isSupabaseConfigured) return null;
  const data = await conReintentoDeEsquema(async () => {
    const { data: fila, error } = await supabase.rpc('marcar_hito_de_pago', {
      p_service_id: serviceId,
      p_hito: hito,
    });
    if (error) throw error;
    return fila;
  });
  return data ? mapServiceAlertFromDb(data as DbServiceAlert) : null;
}

/**
 * Archiva/desarchiva un servicio. El proveedor escribe su fila; un conductor
 * archiva solo para él (`service_archives`), porque la bandera del servicio es
 * una sola y ocultarla afectaría al proveedor.
 */
export async function archivarServicio(serviceId: string, archivado: boolean): Promise<void> {
  if (!isSupabaseConfigured) return;
  await conReintentoDeEsquema(async () => {
    const { error } = await supabase.rpc('archivar_servicio', {
      p_service_id: serviceId,
      p_archivado: archivado,
    });
    if (error) throw error;
    return true;
  });
}

/** Ids que YO tengo archivados (el conductor archiva para sí mismo). */
export async function fetchServiceArchivesForDriver(userId: string): Promise<string[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('service_archives')
    .select('service_id')
    .eq('user_id', userId);
  if (error) throw error;
  return ((data || []) as { service_id: string }[]).map((row) => row.service_id);
}

// ---------------------------------------------------------------------------
// Pago del servicio (migración 0013)
// El ciclo entero vive en la base: declaración del conductor, aceptación del
// proveedor y confirmación de quien recibe. Las funciones devuelven la fila ya
// actualizada para que la UI se sincronice con lo que quedó guardado.
// ---------------------------------------------------------------------------

function aFilaDeRpc(data: unknown): ServiceAlert | null {
  // `RETURNS public.service_alerts` llega como objeto; se acepta también un array
  // de una fila por si PostgREST lo envuelve.
  const fila = Array.isArray(data) ? data[0] : data;
  return fila ? mapServiceAlertFromDb(fila as DbServiceAlert) : null;
}

/** El conductor declara ("Yo pago" / "Me deben") el monto del servicio finalizado. */
export async function declararPagoDelServicio(
  serviceId: string,
  direccion: 'DRIVER_PAYS_PROVIDER' | 'PROVIDER_PAYS_DRIVER',
  monto: number
): Promise<ServiceAlert | null> {
  if (!isSupabaseConfigured) return null;
  const data = await conReintentoDeEsquema(async () => {
    const { data: fila, error } = await supabase.rpc('declarar_pago_servicio', {
      p_service_id: serviceId,
      p_direccion: direccion,
      p_monto: monto,
    });
    if (error) throw error;
    return fila;
  });
  return aFilaDeRpc(data);
}

/** El proveedor acepta o rechaza el monto declarado. */
export async function resolverDeclaracionDePago(
  serviceId: string,
  aceptar: boolean
): Promise<ServiceAlert | null> {
  if (!isSupabaseConfigured) return null;
  const data = await conReintentoDeEsquema(async () => {
    const { data: fila, error } = await supabase.rpc('resolver_declaracion_de_pago', {
      p_service_id: serviceId,
      p_aceptar: aceptar,
    });
    if (error) throw error;
    return fila;
  });
  return aFilaDeRpc(data);
}

/** Datos de pago del conductor: solo el proveedor del servicio y solo en el caso B. */
export async function datosDePagoDelConductor(serviceId: string): Promise<{
  billeteraTipo?: string;
  billeteraNombre?: string;
  yape?: string;
  bancoNombre?: string;
  bcpAccount?: string;
  bcpCci?: string;
} | null> {
  if (!isSupabaseConfigured) return null;
  const data = await conReintentoDeEsquema(async () => {
    const { data: filas, error } = await supabase.rpc('datos_de_pago_del_conductor', {
      p_service_id: serviceId,
    });
    if (error) throw error;
    return filas;
  });
  const fila = (Array.isArray(data) ? data[0] : data) as
    | {
        billetera_tipo?: string | null;
        billetera_nombre?: string | null;
        yape?: string | null;
        banco_nombre?: string | null;
        bcp_account?: string | null;
        bcp_cci?: string | null;
      }
    | null
    | undefined;
  if (!fila) return null;
  return {
    // 0039: sin la migración estas columnas no viajan y las etiquetas caen al texto genérico.
    billeteraTipo: fila.billetera_tipo || undefined,
    billeteraNombre: fila.billetera_nombre || undefined,
    yape: fila.yape || undefined,
    bancoNombre: fila.banco_nombre || undefined,
    bcpAccount: fila.bcp_account || undefined,
    bcpCci: fila.bcp_cci || undefined,
  };
}

/**
 * Datos de pago del proveedor del servicio (migración 0014): en el caso A
 * ("Yo pago") el conductor es quien transfiere, así que necesita ver el
 * Yape/Plin, la cuenta y el CCI del proveedor dentro del propio chat. Van por
 * función autorizada porque `profiles` no expone esos campos a terceros.
 */
export async function datosDePagoDelProveedor(serviceId: string): Promise<{
  billeteraTipo?: string;
  billeteraNombre?: string;
  yape?: string;
  bancoNombre?: string;
  bcpAccount?: string;
  bcpCci?: string;
  nombre?: string;
} | null> {
  if (!isSupabaseConfigured) return null;
  const data = await conReintentoDeEsquema(async () => {
    const { data: filas, error } = await supabase.rpc('datos_de_pago_del_proveedor', {
      p_service_id: serviceId,
    });
    if (error) throw error;
    return filas;
  });
  const fila = (Array.isArray(data) ? data[0] : data) as
    | {
        billetera_tipo?: string | null;
        billetera_nombre?: string | null;
        yape?: string | null;
        banco_nombre?: string | null;
        bcp_account?: string | null;
        bcp_cci?: string | null;
        nombre?: string | null;
      }
    | null
    | undefined;
  if (!fila) return null;
  return {
    billeteraTipo: fila.billetera_tipo || undefined,
    billeteraNombre: fila.billetera_nombre || undefined,
    yape: fila.yape || undefined,
    bancoNombre: fila.banco_nombre || undefined,
    bcpAccount: fila.bcp_account || undefined,
    bcpCci: fila.bcp_cci || undefined,
    nombre: fila.nombre || undefined,
  };
}

/**
 * Anula (elimina) una tarjeta de servicio. Sus postulaciones y mensajes caen por
 * `ON DELETE CASCADE`.
 *
 * Igual que con el borrado de integrantes: con RLS, un DELETE que no toca
 * ninguna fila NO es un error (PostgREST responde 204 y el cliente cree que
 * borró). Se comprueba leyendo la fila después, para no dejar una tarjeta que
 * "desaparece" y reaparece al recargar.
 */
export async function deleteServiceAlert(serviceId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('service_alerts').delete().eq('id', serviceId);
  if (error) throw error;

  const { count, error: readError } = await supabase
    .from('service_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('id', serviceId);
  if (readError) throw readError;
  if ((count ?? 0) > 0) {
    throw new Error(
      'La tarjeta sigue en la base después de anularla: revisa la política DELETE de ' +
        'service_alerts (0001 "Providers manage own services" es FOR ALL y debería permitirlo).'
    );
  }
}

/**
 * Borra MI postulación (el conductor desiste de postularse) y dice si borró algo.
 *
 * Se BORRA la fila a propósito, no se marca `REJECTED`: `REJECTED` es «el proveedor no me
 * eligió» (la tarjeta queda con la franja de rechazado, el chat se cierra y el servicio
 * desaparece de mis disponibles). Desistir es distinto: es como no haberse postulado nunca,
 * así que la tarjeta sigue en «Disponibles» y puedo volver a postularme. La RLS de 0001
 * («Drivers manage own applications») deja al conductor borrar su propia fila.
 *
 * Como en el resto del proyecto, se comprueban las filas borradas: PostgREST responde 204
 * sin error aunque la política no deje borrar nada.
 */
export async function borrarMiPostulacion(serviceId: string, driverId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const { data, error } = await supabase
    .from('applications')
    .delete()
    .eq('service_id', serviceId)
    .eq('driver_id', driverId)
    .select('id');
  if (error) throw error;
  return (data || []).length > 0;
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

  // Como en el resto del proyecto: se piden las filas y se comprueba que el cambio
  // llegó (PostgREST responde sin error aunque la política RLS no deje tocar nada).
  const { data: actualizadas, error } = await supabase
    .from('applications')
    .update(mapped)
    .eq('service_id', serviceId)
    .eq('driver_id', driverId)
    .select('id');
  if (error) throw error;
  if (!actualizadas || actualizadas.length === 0) {
    throw new Error('La base no actualizó la postulación (revisa que siga existiendo).');
  }
}

export function mapGroupFromDb(row: DbGroup, memberRow?: DbGroupMember): GroupItem {
  return {
    id: row.id,
    name: row.name,
    role: (memberRow?.role as GroupItem['role']) || 'member',
    favorite: memberRow?.favorite || false,
    ownerId: row.owner_id,
    // 0038: la foto del grupo. Sin la migración la columna no viene y queda en null (inicial).
    avatarUrl: (row as { avatar_url?: string | null }).avatar_url ?? null,
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
    metadata: (row as { metadata?: Record<string, any> }).metadata || {},
    created_at: row.created_at,
    edited_at: (row as { edited_at?: string | null }).edited_at ?? null,
  };
}

export async function fetchGroupsForUser(userId: string): Promise<GroupItem[]> {
  if (!isSupabaseConfigured) return [];
  // La foto del grupo (0038) va en el SELECT. Si la migración aún no está aplicada, PostgREST
  // rechaza la consulta ENTERA por una columna que no existe, así que se reintenta sin ella: los
  // grupos se ven igual que antes (con su inicial) en vez de quedarse «Mis grupos» en blanco.
  const consulta = (conFoto: boolean) =>
    supabase
      .from('group_members')
      .select(
        conFoto
          ? 'group_id, role, favorite, muted, groups(id, name, owner_id, avatar_url)'
          : 'group_id, role, favorite, muted, groups(id, name, owner_id)'
      )
      .eq('user_id', userId);

  let { data, error } = await consulta(true);
  if (error && esColumnaAusente(error)) {
    console.warn('[database] los grupos se leen sin foto: falta aplicar 0038_foto_del_grupo.sql');
    ({ data, error } = await consulta(false));
  }
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
        // 0028: si el usuario silenció este grupo. Sin la migración llega undefined y la app
        // se comporta como si no estuviera silenciado (que es la verdad).
        muted: row.muted === true,
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
  ownerId: string,
  avatarUrl?: string | null
): Promise<{ group: DbGroup; member: DbGroupMember }> {
  if (!isSupabaseConfigured) throw new Error('La app no está conectada a la base de datos.');
  // La foto (0038) es opcional: si la migración no está aplicada, se crea el grupo SIN foto en vez
  // de dejar al usuario sin grupo (antes intentaba guardarla y el INSERT fallaba entero).
  const insertar = (conFoto: boolean) =>
    supabase
      .from('groups')
      .insert(
        conFoto && avatarUrl
          ? { name, owner_id: ownerId, avatar_url: avatarUrl }
          : { name, owner_id: ownerId }
      )
      .select()
      .single();

  let { data: group, error: groupError } = await insertar(Boolean(avatarUrl));
  if (groupError && esColumnaAusente(groupError)) {
    console.warn('[database] el grupo se crea sin foto: falta aplicar 0038_foto_del_grupo.sql');
    ({ data: group, error: groupError } = await insertar(false));
  }
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
  if (!isSupabaseConfigured) throw new Error('La app no está conectada a la base de datos.');
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
 * Arma el texto con lo que la base sí puede decirnos (tu rol en el grupo, si la
 * fila del integrante sigue ahí y si ese integrante es el creador del grupo)
 * para que el fallo diga la causa en vez de quedar mudo.
 */
async function describirBloqueoDeFila(
  groupId: string,
  targetUserId: string,
  accion: 'eliminar al integrante' | 'cambiar el rol' | 'marcar el grupo como favorito'
): Promise<string> {
  const partes: string[] = [];
  let objetivoEsElCreador: boolean | null = null;
  let objetivoSigueAhi: boolean | null = null;

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

    const { data: objetivo } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', targetUserId)
      .maybeSingle();
    objetivoSigueAhi = Boolean(objetivo);
    partes.push(
      objetivo
        ? `la fila del integrante SIGUE en la base (rol="${objetivo.role}")`
        : 'la fila del integrante ya no está en la base'
    );

    const { data: grupo } = await supabase
      .from('groups')
      .select('owner_id')
      .eq('id', groupId)
      .maybeSingle();
    if (grupo?.owner_id) {
      objetivoEsElCreador = grupo.owner_id === targetUserId;
      partes.push(
        objetivoEsElCreador
          ? `ese integrante ES el creador del grupo (${grupo.owner_id})`
          : `el creador del grupo es ${grupo.owner_id} y no es ese integrante`
      );
    }
  } catch {
    // El diagnóstico es informativo: nunca debe tapar el error original.
  }

  let causa: string;
  if (objetivoEsElCreador) {
    causa =
      'La app te dejó intentarlo pero la base lo rechaza a propósito: la fila del creador del grupo ' +
      'no se puede eliminar (es quien puede volver a agregar integrantes). No hay nada que arreglar: ' +
      'si quieres sacarlo del grupo, antes hay que transferir la propiedad del grupo.';
  } else if (objetivoSigueAhi) {
    causa =
      'Tu fila es owner/admin y el integrante no es el creador, así que el borrado debería estar permitido: ' +
      'revisa las políticas DELETE/UPD de group_members en tu base (puede quedar una política vieja o una ' +
      'RESTRICTIVE que anule las demás), con: ' +
      "select polname, cmd, permissive, qual::text from pg_policies where tablename = 'group_members';";
  } else {
    causa =
      'La fila no está en la base, así que el borrado sí ocurrió; vuelve a abrir el grupo para refrescar la lista.';
  }

  return (
    `Supabase respondió OK pero no se pudo ${accion}. ` +
    `Datos de la base: ${partes.join('; ') || 'sin datos'}. ${causa} ` +
    `Comprueba el grupo con: select gm.user_id, gm.role from public.group_members gm where gm.group_id = '${groupId}';`
  );
}

export async function updateGroupMember(
  groupId: string,
  userId: string,
  updates: Partial<Pick<DbGroupMember, 'role' | 'favorite'>>
): Promise<void> {
  if (!isSupabaseConfigured) return;

  // Cambio de rol por RPC (migración 0007): misma autorización que el borrado y
  // devuelve las filas afectadas, así que no depende de las políticas RLS.
  if (updates.role) {
    try {
      const { data, error } = await supabase.rpc('set_group_member_role', {
        p_group_id: groupId,
        p_user_id: userId,
        p_role: updates.role,
      });
      if (error) throw error;
      if (Number(data ?? 0) > 0) return;
      if (!(await sigueLaFila(groupId, userId))) {
        throw new Error('Ese usuario ya no es integrante del grupo.');
      }
    } catch (err) {
      if (!esFuncionAusente(err)) throw err;
      // eslint-disable-next-line no-console
      console.warn('[database] RPC set_group_member_role no instalada, uso UPDATE directo:', err);
    }
  }

  // Cambio del FAVORITO por RPC (migración 0023): es un dato personal y la política
  // UPDATE de `group_members` (0006) exige ser administrador, así que un integrante
  // normal no podía escribir ni su propia fila: el toque del corazón no hacía nada
  // (el UPDATE no tocaba filas, el cliente lo detectaba y revertía el cambio optimista).
  let faltaLaRpcDelFavorito = false;
  if (updates.favorite !== undefined && !updates.role) {
    try {
      const { data, error } = await supabase.rpc('marcar_grupo_favorito', {
        p_group_id: groupId,
        p_favorito: updates.favorite,
      });
      if (error) throw error;
      if (Number(data ?? 0) > 0) return;
      // La función corrió y no tocó ninguna fila: no soy integrante de ese grupo.
      throw new Error('No eres integrante de ese grupo.');
    } catch (err) {
      if (!esFuncionAusente(err)) throw err;
      // Sin la 0023 solo el respaldo puede salvar el cambio, y ese solo funciona para
      // quien es admin/owner del grupo. Si también falla, el aviso tiene que NOMBRAR la
      // migración (por eso se recuerda aquí el error de PostgREST).
      faltaLaRpcDelFavorito = true;
      // eslint-disable-next-line no-console
      console.warn(
        '[database] RPC marcar_grupo_favorito no instalada (0023), uso UPDATE directo:',
        err
      );
    }
  }

  // Respaldo: UPDATE directo (queda expuesto al RLS de la tabla).
  const { data: grupo, error: grupoError } = await supabase
    .from('groups')
    .select('owner_id')
    .eq('id', groupId)
    .maybeSingle();
  if (grupoError) throw grupoError;
  if (grupo?.owner_id && grupo.owner_id === userId) {
    throw new Error(
      'El creador del grupo no puede cambiar de rol: es quien puede volver a agregar integrantes.'
    );
  }

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
    const accion = updates.role ? 'cambiar el rol' : 'marcar el grupo como favorito';
    const detalle = await describirBloqueoDeFila(groupId, userId, accion);
    if (faltaLaRpcDelFavorito) {
      // Se devuelve con el código de "función ausente" a propósito: así el aviso de la
      // app dice QUÉ migración aplicar y no un genérico "el backend rechazó el cambio".
      const err = new Error(detalle) as Error & { code?: string };
      err.code = 'PGRST202';
      throw err;
    }
    throw new Error(detalle);
  }
}

/** ¿El error es "esa función no existe" (migración sin aplicar)? */
export function esFuncionAusente(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  const code = e?.code || '';
  const mensaje = (e?.message || '').toLowerCase();
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    mensaje.includes('could not find the function') ||
    mensaje.includes('does not exist')
  );
}

/** ¿La fila del integrante sigue en la base? */
async function sigueLaFila(groupId: string, userId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('group_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('group_id', groupId)
    .eq('user_id', userId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/**
 * Borra al integrante y devuelve si la base lo confirmó.
 *
 * Primero intenta la RPC `remove_group_member` de la migración 0007: hace la
 * autorización dentro (creador o admin, y nunca el creador) y devuelve cuántas
 * filas borró, así que no depende del estado de las políticas RLS de la tabla —
 * que es justo lo que dejaba el borrado en 0 filas sin error.
 *
 * Si esa RPC no está instalada, cae al DELETE directo con verificación.
 */
/**
 * Elimina un grupo ENTERO (solo su creador).
 *
 * Las claves foráneas cuelgan con `ON DELETE CASCADE` (integrantes, mensajes, lecturas y los
 * servicios compartidos a ese grupo: 0002, 0018 y 0020), así que borrar la fila del grupo se lleva
 * el resto. Con RLS, un DELETE sin permiso NO es un error: PostgREST responde 204 sin borrar nada.
 * Por eso se pide de vuelta el id: si no vuelve, se dice el motivo en vez de fingir que se borró
 * (mismo criterio que en el resto del archivo).
 */
export async function deleteGroup(groupId: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error('La app no está conectada a la base de datos.');
  const { data, error } = await supabase.from('groups').delete().eq('id', groupId).select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(
      'La base no eliminó el grupo. Solo su creador puede eliminarlo (política de borrado de groups).'
    );
  }
}

export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  if (!isSupabaseConfigured) return;

  try {
    const { data, error } = await supabase.rpc('remove_group_member', {
      p_group_id: groupId,
      p_user_id: userId,
    });
    if (error) throw error;
    if (Number(data ?? 0) > 0) return; // borrado confirmado por la base
    if (!(await sigueLaFila(groupId, userId))) return; // ya no estaba
    // La RPC respondió 0 y la fila sigue: seguimos al respaldo para diagnosticar.
  } catch (err) {
    // El rechazo de la RPC (creador, sin permiso, grupo inexistente) es la
    // respuesta: se muestra tal cual, no se insiste por otra vía.
    if (!esFuncionAusente(err)) throw err;
    // eslint-disable-next-line no-console
    console.warn('[database] RPC remove_group_member no instalada, uso DELETE directo:', err);
  }

  // Respaldo: DELETE directo (queda expuesto al RLS de la tabla).
  const { data: grupo, error: grupoError } = await supabase
    .from('groups')
    .select('owner_id')
    .eq('id', groupId)
    .maybeSingle();
  if (grupoError) throw grupoError;
  if (grupo?.owner_id && grupo.owner_id === userId) {
    throw new Error(
      'Ese integrante es el creador del grupo y su fila no se puede eliminar: es quien puede volver a ' +
        'agregar integrantes. Para sacarlo del grupo habría que transferir antes la propiedad del grupo.'
    );
  }

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
  if (!(await sigueLaFila(groupId, userId))) return; // la fila ya no está

  throw new Error(await describirBloqueoDeFila(groupId, userId, 'eliminar al integrante'));
}

/**
 * Salir de un grupo: borra MI fila de `group_members` (migración 0043).
 *
 * No se usa `removeGroupMember` porque ese es para que el creador o un administrador saquen a OTRO
 * (y rechazaría justamente a quien se quiere ir). Va por la función `salir_del_grupo`, que además
 * impide que el creador se vaya, y si esa migración todavía no está aplicada, por el DELETE directo,
 * que la política «Members can leave» también permite.
 */
export async function salirDeUnGrupo(groupId: string, userId: string): Promise<void> {
  if (!isSupabaseConfigured) return;

  try {
    const { data, error } = await supabase.rpc('salir_del_grupo', { p_group_id: groupId });
    if (error) throw error;
    if (Number(data ?? 0) > 0) return; // la base confirmó el borrado
    if (!(await sigueLaFila(groupId, userId))) return; // ya no estaba
  } catch (err) {
    // El rechazo de la función (soy el creador, el grupo no existe) es la respuesta: se muestra.
    if (!esFuncionAusente(err)) throw err;
    // eslint-disable-next-line no-console
    console.warn('[database] RPC salir_del_grupo no instalada, uso DELETE directo:', err);
  }

  const { data, error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .select('user_id');
  if (error) throw error;
  if (data && data.length > 0) return;
  if (!(await sigueLaFila(groupId, userId))) return;
  // Si llegamos aquí, la base dijo que sí y la fila sigue: lo más probable es que falte aplicar la
  // 0043 (es la que da permiso para salir por tu cuenta). Se dice con el comando exacto.
  throw new Error(
    'La base respondió OK pero tu fila sigue en el grupo. Suele ser que falte aplicar la migración 0043. ' +
      'Aplícala con: cat supabase/migrations/0043_salir_del_grupo.sql | docker exec -i supabase-db psql -U supabase_admin -d postgres'
  );
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
      metadata: row.metadata || {},
      created_at: row.created_at,
      edited_at: row.edited_at ?? null,
    };
  });
}

export async function updateGroupMessage(id: string, content: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  // El filtro por autor no se pone aquí: lo impone la política de la 0019. Si la
  // base no deja tocar la fila (no es mía, es del sistema o venció la ventana de
  // edición) la consulta devuelve cero filas y no se declara nada.
  const { data, error } = await supabase
    .from('messages')
    .update({ content })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  return (data || []).length > 0;
}

export async function deleteGroupMessage(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const { data, error } = await supabase.from('messages').delete().eq('id', id).select('id');
  if (error) throw error;
  return (data || []).length > 0;
}

export async function insertMessage(
  groupId: string,
  senderId: string,
  content: string,
  type: ChatMessage['type'] = 'TEXT',
  metadata: Record<string, unknown> = {}
): Promise<ChatMessage> {
  if (!isSupabaseConfigured) throw new Error('La app no está conectada a la base de datos.');
  const { data, error } = await supabase
    .from('messages')
    .insert({ group_id: groupId, sender_id: senderId, content, type, metadata })
    .select()
    .single();
  if (error) throw error;
  return mapMessageFromDb(data);
}

export interface ServiceMessage {
  id: string;
  service_id: string;
  driver_id: string;
  /** NULL = mensaje del sistema. */
  sender_id: string | null;
  content: string;
  type: ChatMessage['type'];
  metadata: Record<string, unknown>;
  created_at: string;
  /** Cuándo se editó (migración 0019). `null` = nunca se editó. */
  edited_at: string | null;
}

export function mapServiceMessageFromDb(row: DbServiceMessage | any): ServiceMessage {
  return {
    id: row.id,
    service_id: row.service_id,
    driver_id: row.driver_id,
    sender_id: row.sender_id ?? null,
    content: row.content,
    type: row.type as ChatMessage['type'],
    metadata: (row.metadata || {}) as Record<string, unknown>,
    created_at: row.created_at,
    edited_at: row.edited_at ?? null,
  };
}

/**
 * ¿El error es "la tabla `service_messages` no existe"? Entonces la migración
 * 0010 todavía no está aplicada en Supabase y hay que decirlo en pantalla en vez
 * de dejar el chat mudo.
 */
export function esTablaAusente(err: unknown): boolean {
  const e = err as { code?: string; message?: string; details?: string } | null;
  if (!e) return false;
  const codigo = e.code || '';
  const texto = `${e.message || ''} ${e.details || ''}`.toLowerCase();
  return (
    codigo === '42P01' ||
    codigo === 'PGRST205' ||
    texto.includes('does not exist') ||
    texto.includes('could not find the table') ||
    texto.includes('schema cache')
  );
}

/**
 * Mensajes del chat 1 a 1 del servicio (conductor <-> proveedor). Antes este
 * historial vivía solo en la memoria del dispositivo: `addMessage` no escribía
 * en la base y por eso el otro lado nunca veía nada.
 */
export async function fetchServiceMessages(
  serviceId: string,
  driverId: string
): Promise<ServiceMessage[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('service_messages')
    .select('*')
    .eq('service_id', serviceId)
    .eq('driver_id', driverId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map((row: any) => mapServiceMessageFromDb(row));
}

export async function insertServiceMessage(params: {
  serviceId: string;
  driverId: string;
  senderId: string | null;
  content: string;
  type?: ChatMessage['type'];
  metadata?: Record<string, unknown>;
}): Promise<ServiceMessage> {
  if (!isSupabaseConfigured) throw new Error('La app no está conectada a la base de datos.');
  const { data, error } = await supabase
    .from('service_messages')
    .insert({
      service_id: params.serviceId,
      driver_id: params.driverId,
      sender_id: params.senderId,
      content: params.content,
      type: params.type ?? 'TEXT',
      metadata: params.metadata ?? {},
    })
    .select()
    .single();
  if (error) throw error;
  return mapServiceMessageFromDb(data);
}

/**
 * ¿El error es "todavía no se puede editar/eliminar mensajes"? Entonces la
 * migración 0019 no está aplicada (falta la columna `edited_at` o la política de
 * UPDATE/DELETE) y hay que decirlo en pantalla en vez de dejar el menú mudo.
 *
 * Vale igual para la 0020 (palomitas): tabla ausente, columna ausente o sin
 * privilegio. En los dos casos lo que falta es aplicar la migración.
 */
export function esMigracionAusente(err: unknown): boolean {
  const e = err as { code?: string; message?: string; details?: string; hint?: string } | null;
  if (!e) return false;
  const codigo = e.code || '';
  const texto = `${e.message || ''} ${e.details || ''} ${e.hint || ''}`.toLowerCase();
  return (
    codigo === '42P01' || // la tabla no existe
    codigo === '42501' || // sin privilegio: no existe la política de la migración
    codigo === '42703' || // no existe la columna
    codigo === 'PGRST204' ||
    codigo === 'PGRST205' ||
    codigo === 'PGRST202' ||
    texto.includes('violates row-level security') ||
    texto.includes('permission denied') ||
    texto.includes('does not exist') ||
    texto.includes('could not find the') ||
    texto.includes('schema cache')
  );
}

/** Nombre anterior, todavía usado por los chats: es el mismo detector. */
export const esEdicionSinMigracion = esMigracionAusente;

/**
 * Editar un mensaje propio del chat del servicio (migración 0019).
 *
 * Devuelve la fila guardada, o `null` si la base no dejó tocarla: no es mía, es
 * del sistema o ya pasaron los 15 minutos. El texto anterior no se guarda en
 * ningún sitio: la base solo pone la marca `edited_at`.
 */
export async function updateServiceMessage(
  id: string,
  content: string
): Promise<ServiceMessage | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from('service_messages')
    .update({ content })
    .eq('id', id)
    .select('*');
  if (error) throw error;
  const fila = (data || [])[0];
  return fila ? mapServiceMessageFromDb(fila) : null;
}

/** Eliminar un mensaje propio del chat del servicio (borrado real, 0019). */
export async function deleteServiceMessage(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const { data, error } = await supabase
    .from('service_messages')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) throw error;
  return (data || []).length > 0;
}

// --------------------------------------------- confirmación de lectura (0020)
// `LecturaDeChat` se define en `lib/palomas.ts` (módulo puro) y se exporta desde
// aquí para que la app tenga una sola definición.
export type { LecturaDeChat };

/**
 * Hasta cuándo leyó cada participante esta conversación del servicio. Con eso la
 * app decide si un mensaje propio lleva una o dos palomitas.
 */
export async function fetchServiceChatReads(
  serviceId: string,
  driverId: string
): Promise<LecturaDeChat[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('service_chat_reads')
    .select('user_id, last_read_at')
    .eq('service_id', serviceId)
    .eq('driver_id', driverId);
  if (error) throw error;
  return (data || []) as LecturaDeChat[];
}

/** Lo mismo para el chat de grupo: la marca de cada integrante. */
export async function fetchGroupChatReads(groupId: string): Promise<LecturaDeChat[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('group_chat_reads')
    .select('user_id, last_read_at')
    .eq('group_id', groupId);
  if (error) throw error;
  return (data || []) as LecturaDeChat[];
}

/**
 * Marca la conversación del servicio como leída AHORA (se llama al abrir el chat
 * y en cada relectura). La hora la pone la base: un reloj adelantado en el
 * teléfono haría que las palomitas mintieran.
 */
export async function marcarLecturaDelServicio(serviceId: string, driverId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.rpc('marcar_lectura_del_servicio', {
    p_service_id: serviceId,
    p_driver_id: driverId,
  });
  if (error) throw error;
}

/** Marca el grupo como leído ahora (la hora la pone la base). */
export async function marcarLecturaDelGrupo(groupId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.rpc('marcar_lectura_del_grupo', { p_group_id: groupId });
  if (error) throw error;
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
  /** 0039: de qué billetera y de qué banco son los números de arriba. */
  billetera_tipo?: string | null;
  billetera_nombre?: string | null;
  banco_nombre?: string | null;
  /** 0042: recibir avisos de emergencias cercanas de grupos que no integra. */
  recibir_emergencias?: boolean | null;
}

/**
 * Guarda (UPDATE) los datos del perfil del usuario autenticado en `profiles`.
 * Comprueba que realmente se haya actualizado una fila: con RLS, un UPDATE sin
 * permisos o sin fila devuelve 0 filas SIN lanzar error, y eso debe verse.
 */
export async function saveProfileData(userId: string, patch: ProfilePatch): Promise<void> {
  if (!isSupabaseConfigured) throw new Error('Supabase no está configurado en esta build.');
  const guardar = (loQueSea: ProfilePatch) =>
    supabase.from('profiles').update(loQueSea).eq('id', userId).select('id');

  let { data, error } = await guardar(patch);

  // Sin la 0039, el UPDATE falla ENTERO por las columnas que no existen: se reintenta sin ellas
  // para que el usuario no se quede sin guardar sus números de cuenta (que es lo importante).
  if (error && esColumnaAusente(error)) {
    console.warn(
      '[database] los datos de pago se guardan sin tipo de billetera ni banco: falta aplicar 0039_tipo_de_billetera_y_banco.sql'
    );
    const sinTipos: ProfilePatch = { ...patch };
    delete sinTipos.billetera_tipo;
    delete sinTipos.billetera_nombre;
    delete sinTipos.banco_nombre;
    ({ data, error } = await guardar(sinTipos));
  }
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

/** Posición publicada por un conductor (la última que envió su dispositivo). */
export interface PosicionDeConductor {
  lat: number;
  lng: number;
  /** Instante en que el dispositivo la publicó (ISO), si vino. */
  visto: string;
}

/**
 * Publica mi última posición conocida.
 *
 * La escribe mi propio dispositivo y sirve para que un proveedor pueda ver a qué
 * distancia estoy de su punto de origen. Si la función todavía no existe
 * (migración 0009 sin aplicar) no es un error: se devuelve false en silencio.
 */
export async function publicarMiPosicion(lat: number, lng: number): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase.rpc('publish_my_position', { p_lat: lat, p_lng: lng });
    if (error) throw error;
    return true;
  } catch (err) {
    if (esFuncionAusente(err)) return false;
    throw err;
  }
}

/**
 * Posiciones de los postulantes pendientes de un servicio.
 *
 * Solo la puede leer el proveedor del servicio (lo decide la función
 * `service_applicant_positions`), y solo devuelve posiciones recientes.
 */
export async function fetchPosicionesDePostulantes(
  serviceId: string
): Promise<Record<string, PosicionDeConductor>> {
  if (!isSupabaseConfigured) return {};
  try {
    const { data, error } = await supabase.rpc('service_applicant_positions', {
      p_service_id: serviceId,
    });
    if (error) throw error;
    const posiciones: Record<string, PosicionDeConductor> = {};
    const filas = (Array.isArray(data) ? data : []) as {
      user_id?: string | null;
      lat?: number | null;
      lng?: number | null;
      seen_at?: string | null;
    }[];
    for (const fila of filas) {
      if (!fila.user_id) continue;
      if (typeof fila.lat !== 'number' || typeof fila.lng !== 'number') continue;
      posiciones[fila.user_id] = { lat: fila.lat, lng: fila.lng, visto: fila.seen_at || '' };
    }
    return posiciones;
  } catch (err) {
    if (esFuncionAusente(err)) return {};
    throw err;
  }
}

// =====================================================================
// Avisos y sin leer (migración 0028, 19-09-2026)
// =====================================================================
// Todo esto tolera que la 0028 no esté aplicada: si falta, la app se queda como estaba (sin
// contador, sin silencio y sin avisos) en vez de romperse. El contador y el silencio se avisan
// por consola para saber qué falta aplicar.

/**
 * Cuántos mensajes sin leer tiene cada grupo del usuario, por id de grupo.
 *
 * Sale de la función `grupos_sin_leer` (0028): cuenta lo que llegó DESPUÉS de la última vez que
 * ese usuario abrió el chat del grupo, sin contar lo que él mismo escribió.
 */
export async function fetchGruposSinLeer(): Promise<Record<string, number>> {
  if (!isSupabaseConfigured) return {};
  const { data, error } = await supabase.rpc('grupos_sin_leer');
  if (error) {
    if (esFuncionAusente(error) || esColumnaAusente(error)) {
      console.warn(
        '[database] no hay contador de sin leer: falta aplicar 0028_avisos_y_grupos_silenciados.sql'
      );
      return {};
    }
    throw error;
  }
  const cuenta: Record<string, number> = {};
  for (const fila of (data ?? []) as { group_id: string; sin_leer: number | string }[]) {
    const numero = Number(fila.sin_leer ?? 0);
    if (fila.group_id && Number.isFinite(numero) && numero > 0) cuenta[fila.group_id] = numero;
  }
  return cuenta;
}

/**
 * Cuántos mensajes sin leer tiene cada conversación de SERVICIO, por `serviceId|driverId`.
 *
 * Sale de la función `servicios_sin_leer` (0040), el espejo de `grupos_sin_leer` para el chat de
 * servicio: cuenta lo que llegó después de la última vez que ese usuario abrió la conversación
 * (`service_chat_reads.last_read_at`, que escribe `marcarLecturaDelServicio`).
 */
export async function fetchServiciosSinLeer(): Promise<Record<string, number>> {
  if (!isSupabaseConfigured) return {};
  const { data, error } = await supabase.rpc('servicios_sin_leer');
  if (error) {
    if (esFuncionAusente(error) || esColumnaAusente(error)) {
      console.warn(
        '[database] no hay contador de sin leer del chat de servicio: falta aplicar 0040_sin_leer_del_chat_de_servicio.sql'
      );
      return {};
    }
    throw error;
  }
  const cuenta: Record<string, number> = {};
  for (const fila of (data ?? []) as {
    service_id: string;
    driver_id: string | null;
    sin_leer: number | string;
  }[]) {
    const numero = Number(fila.sin_leer ?? 0);
    if (fila.service_id && Number.isFinite(numero) && numero > 0) {
      cuenta[claveDeSinLeer(fila.service_id, fila.driver_id || '')] = numero;
    }
  }
  return cuenta;
}

/** La clave con la que se busca el contador de una conversación (servicio + conductor). */
export function claveDeSinLeer(serviceId: string, driverId: string): string {
  return `${serviceId}|${driverId}`;
}

/** Marca el chat del grupo como leído (el contador vuelve a cero). */
export async function marcarGrupoLeido(groupId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const { error } = await supabase.rpc('marcar_grupo_leido', { p_group_id: groupId });
  if (error) {
    if (esFuncionAusente(error) || esColumnaAusente(error)) return false;
    throw error;
  }
  return true;
}

/** Silencia (o vuelve a activar) los avisos del chat de un grupo, solo para este usuario. */
export async function silenciarGrupo(groupId: string, silenciado: boolean): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const { data, error } = await supabase.rpc('silenciar_grupo', {
    p_group_id: groupId,
    p_silenciado: silenciado,
  });
  if (error) {
    if (esFuncionAusente(error) || esColumnaAusente(error)) {
      console.warn(
        '[database] no se pudo silenciar: falta aplicar 0028_avisos_y_grupos_silenciados.sql'
      );
      return false;
    }
    throw error;
  }
  return data === true;
}

/**
 * Cuándo llegó el último mensaje de cada grupo (sin contar los míos), por id de grupo.
 *
 * Sale de `grupos_ultimo_mensaje` (migración 0036) y sirve para que en Mis grupos los grupos
 * que solo integro se ordenen según cuál recibió el último mensaje (pedido del usuario,
 * 20-09-2026). Se devuelve en milisegundos para poder ordenar sin volver a parsear fechas.
 */
/**
 * El resumen de cada grupo para las tarjetas de **Mis grupos** (23-09-2026, migración 0044).
 *
 * Trae, por grupo: el último mensaje (texto, tipo y quién lo escribió) y —para ordenar— cuándo llegó
 * el último RECIBIDO, que es lo que ya hacía `grupos_ultimo_mensaje` (0036). Sin la 0044 la lista se
 * queda como estaba (nombre y, si acaso, la hora que sí traía la 0036): se avisa por consola y no se
 * rompe nada.
 */
export interface ResumenDeGrupoDeLaLista {
  /** Cuándo llegó el último mensaje que NO escribí yo (ordena la lista). */
  ultimoRecibidoAt: number | null;
  /** Cuándo se escribió el último mensaje, sea mío o no (es la hora de la tarjeta). */
  ultimoAt: number | null;
  ultimoTexto: string | null;
  ultimoTipo: string | null;
  /** Primer nombre de quien escribió, o null si lo escribí yo. */
  ultimoAutor: string | null;
  ultimoEsMio: boolean;
}

export async function fetchResumenDeMisGrupos(): Promise<Record<string, ResumenDeGrupoDeLaLista>> {
  if (!isSupabaseConfigured) return {};
  const { data, error } = await supabase.rpc('resumen_de_mis_grupos');
  if (error) {
    if (esFuncionAusente(error) || esColumnaAusente(error)) {
      console.warn(
        '[database] sin el resumen de los grupos: falta aplicar 0044_resumen_de_mis_grupos_y_editar_el_grupo.sql'
      );
      return {};
    }
    throw error;
  }
  const resumen: Record<string, ResumenDeGrupoDeLaLista> = {};
  for (const fila of (data ?? []) as {
    group_id: string;
    ultimo_recibido_at: string | null;
    ultimo_at: string | null;
    ultimo_texto: string | null;
    ultimo_tipo: string | null;
    ultimo_autor: string | null;
    ultimo_es_mio: boolean | null;
  }[]) {
    if (!fila.group_id) continue;
    const marca = (valor: string | null) => {
      const ms = valor ? Date.parse(valor) : NaN;
      return Number.isFinite(ms) ? ms : null;
    };
    resumen[fila.group_id] = {
      ultimoRecibidoAt: marca(fila.ultimo_recibido_at),
      ultimoAt: marca(fila.ultimo_at),
      ultimoTexto: fila.ultimo_texto ?? null,
      ultimoTipo: fila.ultimo_tipo ?? null,
      ultimoAutor: fila.ultimo_autor ?? null,
      ultimoEsMio: fila.ultimo_es_mio === true,
    };
  }
  return resumen;
}

/**
 * Cambiar el nombre del grupo (23-09-2026, migración 0044).
 *
 * Puede el creador O un administrador: la política de `groups` (0002) solo deja al creador, así que
 * esto va por la función autorizada de la 0044, que comprueba el rol por dentro y devuelve el nombre
 * guardado (o el error con su motivo).
 */
export async function cambiarNombreDelGrupo(groupId: string, nombre: string): Promise<string> {
  const { data, error } = await supabase.rpc('cambiar_nombre_del_grupo', {
    p_group_id: groupId,
    p_nombre: nombre,
  });
  if (error) throw error;
  return String(data ?? nombre);
}

/** Cambiar (o quitar, con null) la foto del grupo. Creador o administrador (0044). */
export async function cambiarFotoDelGrupo(groupId: string, avatarUrl: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('cambiar_foto_del_grupo', {
    p_group_id: groupId,
    p_avatar_url: avatarUrl,
  });
  if (error) throw error;
  return String(data ?? '');
}

export async function fetchUltimoMensajePorGrupo(): Promise<Record<string, number>> {
  if (!isSupabaseConfigured) return {};
  const { data, error } = await supabase.rpc('grupos_ultimo_mensaje');
  if (error) {
    if (esFuncionAusente(error) || esColumnaAusente(error)) {
      console.warn(
        '[database] sin «último mensaje» por grupo: falta aplicar 0036_avisos_sin_la_conversacion_abierta_y_ultimo_mensaje.sql'
      );
      return {};
    }
    throw error;
  }
  const cuando: Record<string, number> = {};
  for (const fila of (data ?? []) as { group_id: string; ultimo_at: string | null }[]) {
    const marca = fila.ultimo_at ? Date.parse(fila.ultimo_at) : NaN;
    if (fila.group_id && Number.isFinite(marca)) cuando[fila.group_id] = marca;
  }
  return cuando;
}

// =====================================================================
// «Estoy viendo esta conversación» (migración 0036, 20-09-2026)
// =====================================================================
// El servidor descarta el aviso de la conversación que el usuario está mirando. Todo esto
// tolera que la 0036 no esté aplicada: si falta, se avisa como siempre (nunca romper el chat).

/** Marca que este usuario está mirando la conversación de esa dirección (`/chat/…`, `/grupo/…`). */
export async function marcarConversacionVista(url: string): Promise<boolean> {
  if (!isSupabaseConfigured || !(url ?? '').trim()) return false;
  const { data, error } = await supabase.rpc('marcar_conversacion_vista', { p_url: url });
  if (error) {
    if (esFuncionAusente(error) || esColumnaAusente(error)) return false;
    throw error;
  }
  return data === true;
}

/** Borra la marca: se sale del chat o la app pasa a segundo plano (ahí SÍ tienen que llegar). */
export async function cerrarConversacionVista(): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const { data, error } = await supabase.rpc('cerrar_conversacion_vista');
  if (error) {
    if (esFuncionAusente(error) || esColumnaAusente(error)) return false;
    throw error;
  }
  return data === true;
}

/** Guarda (o actualiza) la suscripción de avisos de este navegador. */
export async function guardarSuscripcionDeAvisos(datos: {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string | null;
}): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const { data, error } = await supabase.rpc('guardar_suscripcion_de_avisos', {
    p_endpoint: datos.endpoint,
    p_p256dh: datos.p256dh,
    p_auth: datos.auth,
    p_user_agent: datos.user_agent ?? null,
  });
  if (error) {
    if (esFuncionAusente(error) || esTablaAusente(error)) {
      console.warn(
        '[database] no se guardó la suscripción de avisos: falta aplicar 0028_avisos_y_grupos_silenciados.sql'
      );
      return false;
    }
    throw error;
  }
  return data === true;
}

/** Borra la suscripción de este navegador (cuando el usuario desactiva los avisos). */
export async function borrarSuscripcionDeAvisos(endpoint: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const { error } = await supabase.from('push_web').delete().eq('endpoint', endpoint);
  if (error) {
    if (esTablaAusente(error)) return false;
    throw error;
  }
  return true;
}
