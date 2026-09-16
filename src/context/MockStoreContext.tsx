import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  ReactNode,
  useRef,
} from 'react';
import { Vibration } from 'react-native';

import { useAuth } from './AuthContext';
import { useRealtimeApplications } from '../hooks/useRealtimeApplications';
import { useRealtimeGroups } from '../hooks/useRealtimeGroups';
import { useRealtimeServices } from '../hooks/useRealtimeServices';
import { Alert } from '../lib/alert';
import {
  approveApplicationInDb,
  fetchApplicationsForDriver,
  fetchApplicationsForProvider,
  fetchGroupMembers,
  fetchGroupsForUser,
  deleteServiceAlert,
  reportarProgresoDelConductor,
  archivarServicio,
  esFuncionAusente,
  declararPagoDelServicio as declararPagoEnDb,
  resolverDeclaracionDePago as resolverDeclaracionEnDb,
  confirmarPagoDelServicio as confirmarPagoEnDb,
  fetchServicesForDriver,
  fetchServicesForProvider,
  insertApplication,
  insertGroup,
  insertGroupMember,
  insertServiceAlert,
  rejectApplicationInDb,
  rejectApplicationFromDb,
  removeGroupMember,
  saveProfileData,
  updateApplication,
  updateGroupMember,
  updateServiceAlert,
  ProfilePatch,
} from '../lib/database';
import { describeError } from '../lib/errors';
import { isSupabaseConfigured } from '../lib/supabase';
import { isVisibleAsDriver, isVisibleAsProvider } from '../lib/visibility';
import { notifyHighPriority } from '../services/notifications';
import { Application, ServiceAlert, ServiceStatus, Message, AppRole, Profile } from '../types';

export interface GroupItem {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
  favorite: boolean;
  /** Creador del grupo (groups.owner_id): manda por encima del rol de miembro. */
  ownerId?: string;
}

export interface GroupMember {
  id: string;
  groupId: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
  /** Teléfono del integrante, si Supabase lo devolvió. */
  phone?: string | null;
  /** Rol de `profiles.role` (DRIVER, PROVIDER, ...), si se pudo leer. */
  profileRole?: string | null;
  /** `profiles.vehicle_data` del integrante, si se pudo leer. */
  vehicleData?: Record<string, unknown> | null;
  /**
   * ¿Se pudo leer la fila del integrante en `profiles`? Si es false, la app
   * muestra un aviso en vez de dejar los datos en blanco sin explicación.
   */
  profileFound?: boolean;
}

/**
 * ¿Es el creador del grupo? Manda por encima del rol de miembro: degradar esa
 * fila deja al grupo sin nadie que pueda agregar integrantes, porque la política
 * RLS de group_members exige rol owner/admin para dar de alta.
 */
export function esPropietarioDelGrupo(
  groups: GroupItem[],
  members: Record<string, GroupMember[]>,
  groupId: string,
  memberId: string
): boolean {
  const grupo = groups.find((g) => g.id === groupId);
  if (grupo?.ownerId) return grupo.ownerId === memberId;
  return (members[groupId] || []).some((m) => m.id === memberId && m.role === 'owner');
}

/**
 * Rol del usuario en un grupo. El creador (groups.owner_id) siempre cuenta como
 * owner, aunque su fila de miembro diga otra cosa; si el usuario no es el
 * creador, manda su fila de miembro. Con eso el permiso que se muestra en la app
 * coincide con lo que va a permitir la política RLS de group_members:
 * solo owner y admin pueden agregar integrantes.
 */
export function rolEnGrupo(
  groups: GroupItem[],
  groupId: string,
  userId: string | undefined,
  fallbackRole: 'owner' | 'admin' | 'member' = 'member'
): 'owner' | 'admin' | 'member' {
  const grupo = groups.find((g) => g.id === groupId);
  if (!grupo) return fallbackRole;
  if (userId && grupo.ownerId === userId) return 'owner';
  return grupo.role;
}

export interface UserProfile {
  firstName: string;
  lastName: string;
  dni: string;
  phone: string;
  vehicleType: string;
  brand: string;
  model: string;
  year: string;
  color: string;
  plate: string;
  providerName: string;
  // Fotos de perfil
  driverPhotoUrl?: string;
  providerPhotoUrl?: string;
  // Datos de pago P2P (proveedor)
  yapeNumber?: string;
  bcpAccount?: string;
  bcpCci?: string;
}

interface MockState {
  role: AppRole;
  services: ServiceAlert[];
  applications: Application[];
  chats: Record<string, Message[]>;
  groups: GroupItem[];
  members: Record<string, GroupMember[]>;
  userProfile: UserProfile | null;
  driverDebt: number;
  debtThreshold: number;
  notifiedServiceIds: Set<string>;
}

type MockAction =
  | { type: 'SET_ROLE'; payload: AppRole }
  | { type: 'SET_GROUPS'; payload: GroupItem[] }
  | { type: 'SET_MEMBERS'; payload: { groupId: string; members: GroupMember[] } }
  | { type: 'SET_SERVICES'; payload: ServiceAlert[] }
  | { type: 'SET_APPLICATIONS'; payload: Application[] }
  | { type: 'ADD_SERVICE'; payload: ServiceAlert }
  | { type: 'UPDATE_SERVICE'; payload: ServiceAlert }
  | { type: 'UPDATE_APPLICATION'; payload: Application }
  | { type: 'APPLY_TO_SERVICE'; payload: { serviceId: string; driverId: string } }
  | { type: 'APPROVE_APPLICATION'; payload: { serviceId: string; driverId: string } }
  | { type: 'REJECT_APPLICATION'; payload: { serviceId: string } }
  | { type: 'REJECT_APPLICATION_FROM'; payload: { serviceId: string; driverId: string } }
  | { type: 'CANCEL_APPLICATION'; payload: { serviceId: string; driverId: string } }
  | { type: 'UPDATE_SERVICE_STATUS'; payload: { serviceId: string; status: ServiceStatus } }
  | { type: 'REMOVE_SERVICE'; payload: { serviceId: string } }
  | { type: 'REMOVE_APPLICATION'; payload: { serviceId: string; driverId: string } }
  | { type: 'ARCHIVE_SERVICE'; payload: { serviceId: string } }
  | { type: 'UNARCHIVE_SERVICE'; payload: { serviceId: string } }
  | { type: 'ADD_MESSAGE'; payload: { serviceId: string; message: Message } }
  | { type: 'ADD_DRIVER_DEBT'; payload: number }
  | { type: 'REDUCE_DRIVER_DEBT'; payload: number }
  | { type: 'SET_DEBT_THRESHOLD'; payload: number }
  | { type: 'PAY_COMMISSION'; payload: { serviceId: string } }
  | { type: 'CONFIRM_DRIVER_PAYMENT'; payload: { serviceId: string } }
  | { type: 'ENABLE_SETTLEMENT'; payload: { serviceId: string } }
  | { type: 'ADVANCE_DRIVER_PROGRESS'; payload: { serviceId: string } }
  | { type: 'TOGGLE_FAVORITE_GROUP'; payload: { groupId: string } }
  | { type: 'ADD_GROUP'; payload: GroupItem }
  | { type: 'ADD_MEMBER'; payload: GroupMember }
  | {
      type: 'UPDATE_MEMBER_ROLE';
      payload: { groupId: string; memberId: string; role: 'owner' | 'admin' | 'member' };
    }
  | { type: 'REMOVE_MEMBER'; payload: { groupId: string; memberId: string } }
  | { type: 'SET_USER_PROFILE'; payload: UserProfile }
  | { type: 'MARK_NOTIFIED'; payload: { serviceId: string } }
  | { type: 'START_PROVIDER_CHAT'; payload: { serviceId: string; driverId: string } }
  | { type: 'MARK_DRIVER_SEEN_CHAT'; payload: { serviceId: string; driverId: string } };

/** Cada cuánto se rehace la carga completa como respaldo del tiempo real. */
const REFRESCO_MS = 15000;

const initialState: MockState = {
  role: 'DRIVER',
  services: [],
  applications: [],
  chats: {},
  groups: [],
  members: {},
  userProfile: null,
  driverDebt: 0,
  debtThreshold: 100,
  notifiedServiceIds: new Set<string>(),
};

function mockReducer(state: MockState, action: MockAction): MockState {
  switch (action.type) {
    case 'SET_ROLE':
      return { ...state, role: action.payload };

    case 'SET_GROUPS':
      return { ...state, groups: action.payload };

    case 'SET_MEMBERS':
      return {
        ...state,
        members: {
          ...state.members,
          [action.payload.groupId]: action.payload.members,
        },
      };

    case 'SET_SERVICES':
      return { ...state, services: action.payload };

    case 'SET_APPLICATIONS':
      return { ...state, applications: action.payload };

    case 'ADD_SERVICE':
      return { ...state, services: [action.payload, ...state.services] };

    case 'UPDATE_SERVICE':
      return {
        ...state,
        services: state.services.map((s) => (s.id === action.payload.id ? action.payload : s)),
      };

    case 'UPDATE_APPLICATION':
      return {
        ...state,
        applications: state.applications.map((a) =>
          a.serviceId === action.payload.serviceId && a.driverId === action.payload.driverId
            ? action.payload
            : a
        ),
      };

    case 'APPLY_TO_SERVICE': {
      const existingCount = state.applications.filter(
        (a) => a.serviceId === action.payload.serviceId
      ).length;
      return {
        ...state,
        applications: [
          ...state.applications,
          {
            serviceId: action.payload.serviceId,
            driverId: action.payload.driverId,
            status: 'PENDING',
            order: existingCount + 1,
          },
        ],
        services: state.services.map((s) =>
          s.id === action.payload.serviceId ? { ...s, status: 'STATUS_PENDING_APPROVAL' } : s
        ),
      };
    }

    case 'APPROVE_APPLICATION':
      return {
        ...state,
        applications: state.applications.map((a) =>
          a.serviceId === action.payload.serviceId
            ? a.driverId === action.payload.driverId
              ? { ...a, status: 'APPROVED' }
              : { ...a, status: 'REJECTED' }
            : a
        ),
        services: state.services.map((s) =>
          s.id === action.payload.serviceId
            ? {
                ...s,
                status: 'STATUS_AT_ORIGIN',
                assigned_driver_id: action.payload.driverId,
                driver_progress_step: 0,
              }
            : s
        ),
      };

    case 'REMOVE_APPLICATION':
      return {
        ...state,
        applications: state.applications.filter(
          (a) =>
            !(a.serviceId === action.payload.serviceId && a.driverId === action.payload.driverId)
        ),
      };

    case 'REMOVE_SERVICE':
      return {
        ...state,
        services: state.services.filter((s) => s.id !== action.payload.serviceId),
        applications: state.applications.filter((a) => a.serviceId !== action.payload.serviceId),
      };

    case 'REJECT_APPLICATION':
      return {
        ...state,
        applications: state.applications.map((a) =>
          a.serviceId === action.payload.serviceId ? { ...a, status: 'REJECTED' } : a
        ),
        services: state.services.map((s) =>
          s.id === action.payload.serviceId
            ? { ...s, status: 'STATUS_OPEN', assigned_driver_id: null }
            : s
        ),
      };

    case 'REJECT_APPLICATION_FROM':
      // Rechaza solo a ese postulante: el servicio sigue igual (los demás siguen
      // en pie). `REJECT_APPLICATION` (sin conductor) los rechaza a todos.
      return {
        ...state,
        applications: state.applications.map((a) =>
          a.serviceId === action.payload.serviceId && a.driverId === action.payload.driverId
            ? { ...a, status: 'REJECTED' }
            : a
        ),
      };

    case 'CANCEL_APPLICATION': {
      const remainingApplications = state.applications.filter(
        (a) => !(a.serviceId === action.payload.serviceId && a.driverId === action.payload.driverId)
      );
      const hasOtherPending = remainingApplications.some(
        (a) => a.serviceId === action.payload.serviceId && a.status === 'PENDING'
      );
      return {
        ...state,
        applications: remainingApplications,
        services: state.services.map((s) =>
          s.id === action.payload.serviceId
            ? {
                ...s,
                status: hasOtherPending ? 'STATUS_PENDING_APPROVAL' : 'STATUS_OPEN',
                assigned_driver_id: null,
              }
            : s
        ),
      };
    }

    case 'UPDATE_SERVICE_STATUS':
      return {
        ...state,
        services: state.services.map((s) =>
          s.id === action.payload.serviceId ? { ...s, status: action.payload.status } : s
        ),
      };

    case 'ARCHIVE_SERVICE':
      return {
        ...state,
        services: state.services.map((s) =>
          s.id === action.payload.serviceId ? { ...s, archived: true } : s
        ),
      };

    case 'UNARCHIVE_SERVICE':
      return {
        ...state,
        services: state.services.map((s) =>
          s.id === action.payload.serviceId ? { ...s, archived: false } : s
        ),
      };

    case 'ADD_MESSAGE':
      return {
        ...state,
        chats: {
          ...state.chats,
          [action.payload.serviceId]: [
            ...(state.chats[action.payload.serviceId] || []),
            action.payload.message,
          ],
        },
      };

    case 'ADD_DRIVER_DEBT':
      return { ...state, driverDebt: state.driverDebt + action.payload };

    case 'REDUCE_DRIVER_DEBT':
      return { ...state, driverDebt: Math.max(state.driverDebt - action.payload, 0) };

    case 'SET_DEBT_THRESHOLD':
      return { ...state, debtThreshold: action.payload };

    case 'PAY_COMMISSION':
      return {
        ...state,
        services: state.services.map((s) =>
          s.id === action.payload.serviceId ? { ...s, commission_paid: true } : s
        ),
      };

    case 'CONFIRM_DRIVER_PAYMENT':
      return {
        ...state,
        services: state.services.map((s) =>
          s.id === action.payload.serviceId ? { ...s, driver_payment_received: true } : s
        ),
      };

    case 'ENABLE_SETTLEMENT':
      return {
        ...state,
        services: state.services.map((s) =>
          s.id === action.payload.serviceId ? { ...s, settlement_enabled: true } : s
        ),
      };

    case 'ADVANCE_DRIVER_PROGRESS':
      return {
        ...state,
        services: state.services.map((s) =>
          s.id === action.payload.serviceId
            ? { ...s, driver_progress_step: (s.driver_progress_step ?? 0) + 1 }
            : s
        ),
      };

    case 'TOGGLE_FAVORITE_GROUP':
      return {
        ...state,
        groups: state.groups.map((g) =>
          g.id === action.payload.groupId ? { ...g, favorite: !g.favorite } : g
        ),
      };

    case 'ADD_GROUP':
      return {
        ...state,
        groups: [action.payload, ...state.groups],
      };

    case 'ADD_MEMBER':
      return {
        ...state,
        members: {
          ...state.members,
          [action.payload.groupId]: [
            ...(state.members[action.payload.groupId] || []),
            action.payload,
          ],
        },
      };

    case 'UPDATE_MEMBER_ROLE':
      return {
        ...state,
        members: {
          ...state.members,
          [action.payload.groupId]: (state.members[action.payload.groupId] || []).map((m) =>
            m.id === action.payload.memberId ? { ...m, role: action.payload.role } : m
          ),
        },
      };

    case 'REMOVE_MEMBER':
      return {
        ...state,
        members: {
          ...state.members,
          [action.payload.groupId]: (state.members[action.payload.groupId] || []).filter(
            (m) => m.id !== action.payload.memberId
          ),
        },
      };

    case 'SET_USER_PROFILE':
      return { ...state, userProfile: action.payload };

    case 'MARK_NOTIFIED': {
      const next = new Set(state.notifiedServiceIds);
      next.add(action.payload.serviceId);
      return { ...state, notifiedServiceIds: next };
    }

    case 'START_PROVIDER_CHAT':
      return {
        ...state,
        applications: state.applications.map((a) =>
          a.serviceId === action.payload.serviceId && a.driverId === action.payload.driverId
            ? { ...a, providerChatStarted: true, seenByDriver: false }
            : a
        ),
      };

    case 'MARK_DRIVER_SEEN_CHAT':
      return {
        ...state,
        applications: state.applications.map((a) =>
          a.serviceId === action.payload.serviceId && a.driverId === action.payload.driverId
            ? { ...a, seenByDriver: true }
            : a
        ),
      };

    default:
      return state;
  }
}

interface MockContextValue extends MockState {
  setRole: (role: AppRole) => void;
  addService: (service: ServiceAlert) => void;
  updateService: (service: ServiceAlert) => void;
  /** Anula la tarjeta: la borra de la base y de la lista. */
  deleteService: (serviceId: string) => Promise<boolean>;
  applyToService: (serviceId: string, driverId: string) => void;
  approveApplication: (serviceId: string, driverId: string) => void;
  rejectApplication: (serviceId: string) => void;
  rejectApplicationFrom: (serviceId: string, driverId: string) => void;
  cancelApplication: (serviceId: string, driverId: string) => void;
  updateServiceStatus: (serviceId: string, status: ServiceStatus) => void;
  archiveService: (serviceId: string) => void;
  unarchiveService: (serviceId: string) => void;
  addMessage: (serviceId: string, message: Message) => void;
  addDriverDebt: (amount: number) => void;
  reduceDriverDebt: (amount: number) => void;
  setDebtThreshold: (amount: number) => void;
  loadGroupMembers: (groupId: string) => Promise<void>;
  reloadGroups: () => Promise<void>;
  /** Pago del servicio (migración 0013): declaración, resolución y confirmación. */
  declararPago: (
    serviceId: string,
    direccion: 'DRIVER_PAYS_PROVIDER' | 'PROVIDER_PAYS_DRIVER',
    monto: number
  ) => Promise<boolean>;
  resolverDeclaracionDePago: (serviceId: string, aceptar: boolean) => Promise<boolean>;
  confirmarPagoRecibido: (serviceId: string) => Promise<boolean>;
  toggleFavoriteGroup: (groupId: string) => void;
  addGroup: (group: GroupItem) => Promise<void>;
  addMember: (member: GroupMember) => void;
  updateMemberRole: (groupId: string, memberId: string, role: 'owner' | 'admin' | 'member') => void;
  /** Devuelve false si la base no confirmó el borrado (para no navegar como si hubiera funcionado). */
  removeMember: (groupId: string, memberId: string) => Promise<boolean>;
  setUserProfile: (profile: UserProfile) => void;
  persistUserProfile: (profile: UserProfile) => Promise<void>;
  emitNotification: (serviceId: string, title?: string) => boolean;
  emitChatNotification: (title: string, body?: string, data?: Record<string, any>) => void;
  startProviderChat: (serviceId: string, driverId: string) => void;
  markDriverSeenChat: (serviceId: string, driverId: string) => void;
  enableSettlement: (serviceId: string) => void;
  advanceDriverProgress: (serviceId: string) => Promise<boolean>;
}

const MockContext = createContext<MockContextValue | undefined>(undefined);

/** Convierte la fila de `profiles` (cargada por AuthContext) al perfil de las pantallas. */
function userProfileFromAuthProfile(profile: Profile): UserProfile {
  const vehicle = profile.vehicle_data || {};
  const [firstToken, ...restTokens] = (profile.full_name || '').trim().split(/\s+/);
  const text = (value: unknown) => (typeof value === 'string' ? value : '');

  return {
    firstName: text(vehicle.first_name) || firstToken || '',
    lastName: text(vehicle.last_name) || restTokens.join(' '),
    dni: text(vehicle.dni),
    phone: profile.phone || '',
    vehicleType: text(vehicle.vehicle_type) || 'Auto',
    brand: text(vehicle.brand),
    model: text(vehicle.model),
    year: vehicle.year !== undefined && vehicle.year !== null ? String(vehicle.year) : '',
    color: text(vehicle.color),
    plate: text(vehicle.plate),
    providerName: text(vehicle.provider_name),
    driverPhotoUrl: text(vehicle.driver_photo_url) || undefined,
    providerPhotoUrl: text(vehicle.provider_photo_url) || undefined,
    yapeNumber: profile.yape_number || undefined,
    bcpAccount: profile.bcp_account || undefined,
    bcpCci: profile.bcp_cci || undefined,
  };
}

/** Convierte el perfil de las pantallas en el patch que se guarda en `profiles`. */
function userProfileToPatch(profile: UserProfile): ProfilePatch {
  const year = profile.year ? Number.parseInt(profile.year, 10) : NaN;

  return {
    full_name: `${profile.firstName} ${profile.lastName}`.trim() || null,
    phone: profile.phone || null,
    vehicle_data: {
      vehicle_type: profile.vehicleType,
      brand: profile.brand,
      model: profile.model,
      year: Number.isNaN(year) ? undefined : year,
      color: profile.color,
      plate: profile.plate,
      dni: profile.dni,
      first_name: profile.firstName,
      last_name: profile.lastName,
      provider_name: profile.providerName,
      driver_photo_url: profile.driverPhotoUrl,
      provider_photo_url: profile.providerPhotoUrl,
    },
    yape_number: profile.yapeNumber || null,
    bcp_account: profile.bcpAccount || null,
    bcp_cci: profile.bcpCci || null,
  };
}

export function MockStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(mockReducer, initialState);
  const { session, profile } = useAuth();
  const loadedRef = useRef(false);

  // Carga inicial desde Supabase cuando hay sesión real
  useEffect(() => {
    if (!isSupabaseConfigured || !session?.user || !profile || loadedRef.current) return;
    loadedRef.current = true;

    const load = async () => {
      try {
        const groups = await fetchGroupsForUser(profile.id);
        dispatch({ type: 'SET_GROUPS', payload: groups });
        const groupIds = groups.map((g) => g.id);

        // Las dos identidades conviven en la misma cuenta: el usuario puede
        // publicar servicios como proveedor y recibir alertas como conductor.
        const [providerServices, driverServices] = await Promise.all([
          fetchServicesForProvider(profile.id),
          fetchServicesForDriver(profile.id, groupIds),
        ]);
        const servicesById = new Map<string, ServiceAlert>();
        [...providerServices, ...driverServices].forEach((s) => servicesById.set(s.id, s));
        dispatch({ type: 'SET_SERVICES', payload: [...servicesById.values()] });

        // Postulaciones: las mías y las recibidas en mis servicios (así al
        // proveedor le llega la tarjeta de quién está postulando).
        const [myApplications, applicationsForMyServices] = await Promise.all([
          fetchApplicationsForDriver(profile.id),
          fetchApplicationsForProvider(providerServices.map((s) => s.id)),
        ]);
        const applicationsByKey = new Map<string, Application>();
        [...myApplications, ...applicationsForMyServices].forEach((a) =>
          applicationsByKey.set(`${a.serviceId}:${a.driverId}`, a)
        );
        dispatch({ type: 'SET_APPLICATIONS', payload: [...applicationsByKey.values()] });
      } catch (err) {
        console.error('[MockStore] Error loading from Supabase:', err);
      }
    };

    load();

    // Respaldo de sincronización: si el proyecto no tiene activado el tiempo real
    // (falta aplicar la migración 0011), las tarjetas se refrescan igual cada
    // REFRESCO_MS, así un servicio nuevo o anulado no se queda pegado.
    const intervalo = setInterval(load, REFRESCO_MS);
    return () => clearInterval(intervalo);
  }, [session?.user, profile]);

  // Hidrata los datos del perfil (nombres, DNI, vehículo, fotos y datos de pago)
  // desde Supabase: antes vivían solo en memoria y se perdían al recargar la app.
  const hydratedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!profile?.id) return;
    if (hydratedUserIdRef.current === profile.id) return;
    hydratedUserIdRef.current = profile.id;
    dispatch({ type: 'SET_USER_PROFILE', payload: userProfileFromAuthProfile(profile) });
  }, [profile]);

  // Sincronización en tiempo real: las tarjetas aparecen y desaparecen en los
  // dos dispositivos sin recargar.
  useRealtimeServices((cambio) => {
    // La tarjeta anulada llega como DELETE y sin `new`: si no se mira `old`, el
    // evento se descarta y la tarjeta se queda en el otro dispositivo.
    if (cambio.evento === 'DELETE') {
      dispatch({ type: 'REMOVE_SERVICE', payload: { serviceId: cambio.id } });
      return;
    }

    const service = cambio.servicio;
    // Solo aceptamos lo que corresponde a alguna de las dos identidades (ver
    // src/lib/visibility.ts): antes entraba cualquier fila y por eso todos veían
    // los servicios de todos.
    const groupIds = state.groups.map((g) => g.id);
    const myId = profile?.id;
    const isRelevant =
      isVisibleAsProvider(service, myId) || isVisibleAsDriver(service, myId, groupIds);
    if (!isRelevant) return;

    const exists = state.services.some((s) => s.id === service.id);
    dispatch({ type: exists ? 'UPDATE_SERVICE' : 'ADD_SERVICE', payload: service });

    // Al conductor le acaban de compartir un servicio: se le avisa en el momento.
    if (cambio.evento === 'INSERT' && service.provider_id !== myId) {
      notifyHighPriority('Nuevo servicio compartido', service.title, {
        serviceId: service.id,
        type: 'NEW_SERVICE',
      });
    }
  });

  useRealtimeGroups(session?.user?.id, (group) => {
    const exists = state.groups.some((g) => g.id === group.id);
    const next = exists
      ? state.groups.map((g) => (g.id === group.id ? group : g))
      : [...state.groups, group];
    dispatch({ type: 'SET_GROUPS', payload: next });
  });

  useRealtimeApplications((cambio) => {
    if (cambio.evento === 'DELETE') {
      dispatch({
        type: 'REMOVE_APPLICATION',
        payload: { serviceId: cambio.serviceId, driverId: cambio.driverId },
      });
      return;
    }

    const application = cambio.aplicacion;
    const exists = state.applications.some(
      (a) => a.serviceId === application.serviceId && a.driverId === application.driverId
    );
    dispatch({ type: exists ? 'UPDATE_APPLICATION' : 'APPLY_TO_SERVICE', payload: application });
  });

  const persistService = async (serviceId: string, updates: Partial<ServiceAlert>) => {
    if (!isSupabaseConfigured) return;
    try {
      await updateServiceAlert(serviceId, updates);
    } catch (err) {
      console.error('[MockStore] updateServiceAlert error:', err);
    }
  };

  const persistApplication = async (
    serviceId: string,
    driverId: string,
    updates: Partial<Application>
  ) => {
    if (!isSupabaseConfigured) return;
    try {
      await updateApplication(serviceId, driverId, updates);
    } catch (err) {
      console.error('[MockStore] updateApplication error:', err);
    }
  };

  // ---------------------------------------------------------------------------
  // Escrituras sobre `service_alerts`
  // El proveedor escribe su propia fila (RLS); el conductor NO puede: su avance y
  // su cuadre van por las funciones de la migración 0012. Antes el conductor
  // escribía directo, la base descartaba el UPDATE sin error y el proceso se
  // quedaba en bucle (volvía al estado real al recargar).
  // ---------------------------------------------------------------------------

  /** ¿Este servicio lo publiqué yo como proveedor? */
  const esServicioPropio = (serviceId: string) => {
    const service = state.services.find((s) => s.id === serviceId);
    return !!service && service.provider_id === profile?.id;
  };

  const avisoDeMigracion =
    'El backend no encontró la función. Si la migración 0012 ' +
    '(supabase/migrations/0012_reporte_del_conductor.sql) ya está aplicada, espera unos segundos ' +
    "y reintenta: PostgREST recarga su esquema solo (o fuérzalo con NOTIFY pgrst, 'reload schema';).";

  /** Texto del aviso: el detalle crudo del backend va siempre, para diagnosticar. */
  const detalleDe = (err: unknown, titulo: string) =>
    esFuncionAusente(err)
      ? `${avisoDeMigracion}\n\nDetalle: ${describeError(err)}`
      : `${titulo}\n\n${describeError(err)}`;

  const escribirServicio = async (
    serviceId: string,
    cambios: Partial<ServiceAlert>,
    titulo: string
  ): Promise<boolean> => {
    if (!isSupabaseConfigured) return true;
    try {
      const actualizado = await updateServiceAlert(serviceId, cambios);
      if (actualizado) dispatch({ type: 'UPDATE_SERVICE', payload: actualizado });
      return true;
    } catch (err) {
      console.error('[MockStore] escribirServicio error:', err);
      Alert.alert(titulo, detalleDe(err, titulo));
      return false;
    }
  };

  /** Avance del viaje (1 ubicado, 2 en proceso, 3 finalizado). */
  const reportarAvance = async (serviceId: string, paso: number): Promise<boolean> => {
    if (!isSupabaseConfigured) return true;
    try {
      const actualizado = esServicioPropio(serviceId)
        ? await updateServiceAlert(serviceId, { driver_progress_step: paso })
        : await reportarProgresoDelConductor(serviceId, paso);
      if (actualizado) dispatch({ type: 'UPDATE_SERVICE', payload: actualizado });
      return true;
    } catch (err) {
      console.error('[MockStore] reportarAvance error:', err);
      Alert.alert('No se pudo reportar el avance', detalleDe(err, 'El backend rechazó el reporte'));
      return false;
    }
  };

  const archivarSegunRol = async (serviceId: string, archivado: boolean) => {
    if (!isSupabaseConfigured) return;
    try {
      if (esServicioPropio(serviceId)) {
        await updateServiceAlert(serviceId, { archived: archivado });
      } else {
        // El conductor archiva solo para él (service_archives): la bandera del
        // servicio es una sola y ocultarla afectaría al proveedor.
        await archivarServicio(serviceId, archivado);
      }
    } catch (err) {
      console.error('[MockStore] archivarSegunRol error:', err);
      Alert.alert('No se pudo archivar', detalleDe(err, 'El backend rechazó el archivado'));
    }
  };

  // Identidad estable: las pantallas que la usan dentro de un useEffect ya no
  // disparan el efecto en cada render del store (antes se pedían los miembros
  // del grupo en bucle).
  const loadGroupMembers = useCallback(async (groupId: string) => {
    try {
      const members = await fetchGroupMembers(groupId);
      dispatch({ type: 'SET_MEMBERS', payload: { groupId, members } });
    } catch (err) {
      console.error('[MockStore] loadGroupMembers error:', err);
    }
  }, []);

  // Refresca los grupos del usuario (rol dentro de cada grupo y creador). Se usa
  // al abrir la pantalla de integrantes para que el permiso mostrado no dependa
  // de datos cargados al inicio de la sesión.
  const reloadGroups = useCallback(async () => {
    if (!isSupabaseConfigured || !profile?.id) return;
    try {
      const groups = await fetchGroupsForUser(profile.id);
      dispatch({ type: 'SET_GROUPS', payload: groups });
    } catch (err) {
      console.error('[MockStore] reloadGroups error:', err);
    }
  }, [profile?.id]);

  const value: MockContextValue = {
    ...state,
    setRole: (role) => dispatch({ type: 'SET_ROLE', payload: role }),
    addService: async (service) => {
      if (isSupabaseConfigured) {
        try {
          const inserted = await insertServiceAlert(service);
          dispatch({ type: 'ADD_SERVICE', payload: inserted });
          return;
        } catch (err) {
          console.error('[MockStore] insertServiceAlert error:', err);
        }
      }
      dispatch({ type: 'ADD_SERVICE', payload: service });
    },
    updateService: async (service) => {
      await persistService(service.id, service);
      dispatch({ type: 'UPDATE_SERVICE', payload: service });
    },
    deleteService: async (serviceId) => {
      try {
        await deleteServiceAlert(serviceId);
      } catch (err) {
        console.error('[MockStore] deleteServiceAlert error:', err);
        Alert.alert('No se pudo anular la tarjeta', describeError(err));
        return false;
      }
      dispatch({ type: 'REMOVE_SERVICE', payload: { serviceId } });
      return true;
    },
    applyToService: async (serviceId, driverId) => {
      if (isSupabaseConfigured) {
        try {
          await insertApplication(serviceId, driverId);
        } catch (err) {
          console.error('[MockStore] insertApplication error:', err);
        }
      }
      dispatch({ type: 'APPLY_TO_SERVICE', payload: { serviceId, driverId } });
    },
    approveApplication: async (serviceId, driverId) => {
      if (isSupabaseConfigured) {
        try {
          await approveApplicationInDb(serviceId, driverId);
        } catch (err) {
          console.error('[MockStore] approveApplicationInDb error:', err);
        }
      }
      dispatch({ type: 'APPROVE_APPLICATION', payload: { serviceId, driverId } });
    },
    rejectApplication: async (serviceId) => {
      if (isSupabaseConfigured) {
        try {
          await rejectApplicationInDb(serviceId);
        } catch (err) {
          console.error('[MockStore] rejectApplicationInDb error:', err);
        }
      }
      dispatch({ type: 'REJECT_APPLICATION', payload: { serviceId } });
    },
    rejectApplicationFrom: async (serviceId, driverId) => {
      if (isSupabaseConfigured) {
        try {
          await rejectApplicationFromDb(serviceId, driverId);
        } catch (err) {
          console.error('[MockStore] rejectApplicationFromDb error:', err);
          Alert.alert('No se pudo rechazar al postulante', describeError(err));
          return;
        }
      }
      dispatch({ type: 'REJECT_APPLICATION_FROM', payload: { serviceId, driverId } });
    },
    cancelApplication: async (serviceId, driverId) => {
      await persistApplication(serviceId, driverId, { status: 'REJECTED' });
      dispatch({ type: 'CANCEL_APPLICATION', payload: { serviceId, driverId } });
    },
    updateServiceStatus: async (serviceId, status) => {
      if (esServicioPropio(serviceId)) {
        const ok = await escribirServicio(serviceId, { status }, 'No se pudo cambiar el estado');
        if (!ok) return;
      } else {
        // El conductor no puede escribir la fila: reporta el paso equivalente.
        const paso = status === 'STATUS_COMPLETED' ? 3 : status === 'STATUS_IN_PROGRESS' ? 2 : null;
        if (paso) {
          const ok = await reportarAvance(serviceId, paso);
          if (!ok) return;
        }
      }
      dispatch({ type: 'UPDATE_SERVICE_STATUS', payload: { serviceId, status } });
    },
    archiveService: async (serviceId) => {
      await archivarSegunRol(serviceId, true);
      dispatch({ type: 'ARCHIVE_SERVICE', payload: { serviceId } });
    },
    unarchiveService: async (serviceId) => {
      await archivarSegunRol(serviceId, false);
      dispatch({ type: 'UNARCHIVE_SERVICE', payload: { serviceId } });
    },
    addMessage: (serviceId, message) =>
      dispatch({ type: 'ADD_MESSAGE', payload: { serviceId, message } }),
    addDriverDebt: (amount) => dispatch({ type: 'ADD_DRIVER_DEBT', payload: amount }),
    reduceDriverDebt: (amount) => dispatch({ type: 'REDUCE_DRIVER_DEBT', payload: amount }),
    setDebtThreshold: (amount) => dispatch({ type: 'SET_DEBT_THRESHOLD', payload: amount }),
    loadGroupMembers,
    reloadGroups,
    declararPago: async (serviceId, direccion, monto) => {
      try {
        const actualizado = await declararPagoEnDb(serviceId, direccion, monto);
        if (!actualizado) {
          // Sin fila devuelta no hay nada que mostrar: avisar en vez de dejarlo pasar
          // (antes la declaración se perdía en silencio y parecía que el otro lado
          // no tenía nada que hacer).
          Alert.alert(
            'No se pudo declarar el pago',
            'La base no devolvió el servicio. Revisa que el viaje esté en Finalizado y que tú seas el conductor asignado, y vuelve a intentarlo.'
          );
          return false;
        }
        dispatch({ type: 'UPDATE_SERVICE', payload: actualizado });
        return true;
      } catch (err) {
        console.error('[MockStore] declararPago error:', err);
        Alert.alert(
          'No se pudo declarar el pago',
          detalleDe(err, 'El backend rechazó la declaración')
        );
        return false;
      }
    },
    resolverDeclaracionDePago: async (serviceId, aceptar) => {
      try {
        const actualizado = await resolverDeclaracionEnDb(serviceId, aceptar);
        if (!actualizado) {
          Alert.alert(
            aceptar ? 'No se pudo aceptar el monto' : 'No se pudo rechazar el monto',
            'Ya no hay un monto pendiente de resolver en este servicio (puede haberse resuelto desde el otro dispositivo).'
          );
          return false;
        }
        dispatch({ type: 'UPDATE_SERVICE', payload: actualizado });
        return true;
      } catch (err) {
        console.error('[MockStore] resolverDeclaracionDePago error:', err);
        Alert.alert(
          aceptar ? 'No se pudo aceptar el monto' : 'No se pudo rechazar el monto',
          detalleDe(err, 'El backend rechazó el cambio')
        );
        return false;
      }
    },
    confirmarPagoRecibido: async (serviceId) => {
      try {
        const actualizado = await confirmarPagoEnDb(serviceId);
        if (!actualizado) {
          Alert.alert(
            'No se pudo confirmar el pago',
            'El pago no está en "Pago en camino": solo quien recibe el dinero puede confirmarlo una vez aceptado el monto.'
          );
          return false;
        }
        dispatch({ type: 'UPDATE_SERVICE', payload: actualizado });
        return true;
      } catch (err) {
        console.error('[MockStore] confirmarPagoRecibido error:', err);
        Alert.alert(
          'No se pudo confirmar el pago',
          detalleDe(err, 'El backend rechazó la confirmación')
        );
        return false;
      }
    },
    toggleFavoriteGroup: async (groupId) => {
      const group = state.groups.find((g) => g.id === groupId);
      if (!session?.user || !group) return;
      const nextFavorite = !group.favorite;
      dispatch({ type: 'TOGGLE_FAVORITE_GROUP', payload: { groupId } });
      try {
        await updateGroupMember(groupId, session.user.id, { favorite: nextFavorite });
      } catch (err) {
        console.error('[MockStore] toggleFavoriteGroup error:', err);
        dispatch({ type: 'TOGGLE_FAVORITE_GROUP', payload: { groupId } });
      }
    },
    addGroup: async (group) => {
      if (!isSupabaseConfigured) {
        throw new Error('Supabase no está configurado en esta build.');
      }
      if (!session?.user) {
        throw new Error('No hay sesión activa. Vuelve a iniciar sesión.');
      }
      try {
        const { group: dbGroup, member } = await insertGroup(group.name, session.user.id);
        dispatch({
          type: 'ADD_GROUP',
          payload: {
            id: dbGroup.id,
            name: dbGroup.name,
            role: member.role as GroupItem['role'],
            favorite: member.favorite,
            ownerId: dbGroup.owner_id,
          },
        });
      } catch (err) {
        console.error('[MockStore] addGroup error:', err);
        throw err;
      }
    },
    addMember: async (member) => {
      try {
        const dbRole = member.role === 'owner' ? 'admin' : member.role;
        await insertGroupMember(member.groupId, member.id, dbRole);
        dispatch({ type: 'ADD_MEMBER', payload: member });
      } catch (err) {
        console.error('[MockStore] addMember error:', err);
        throw err;
      }
    },
    updateMemberRole: async (groupId, memberId, role) => {
      if (esPropietarioDelGrupo(state.groups, state.members, groupId, memberId)) {
        Alert.alert('No permitido', 'El propietario del grupo no puede cambiar de rol.');
        return;
      }
      try {
        await updateGroupMember(groupId, memberId, { role });
        dispatch({ type: 'UPDATE_MEMBER_ROLE', payload: { groupId, memberId, role } });
      } catch (err) {
        console.error('[MockStore] updateMemberRole error:', err);
        Alert.alert('No se pudo cambiar el rol', describeError(err));
      }
    },
    removeMember: async (groupId, memberId) => {
      if (esPropietarioDelGrupo(state.groups, state.members, groupId, memberId)) {
        Alert.alert('No permitido', 'No puedes eliminar al propietario del grupo.');
        return false;
      }
      try {
        // removeGroupMember comprueba que la fila se haya ido de verdad: con RLS,
        // un DELETE filtrado responde OK y el integrante reaparecía al recargar.
        await removeGroupMember(groupId, memberId);
        dispatch({ type: 'REMOVE_MEMBER', payload: { groupId, memberId } });
        return true;
      } catch (err) {
        console.error('[MockStore] removeMember error:', err);
        Alert.alert('No se pudo eliminar al integrante', describeError(err));
        return false;
      }
    },
    setUserProfile: (profile) => dispatch({ type: 'SET_USER_PROFILE', payload: profile }),
    persistUserProfile: async (nextProfile) => {
      if (!isSupabaseConfigured) throw new Error('Supabase no está configurado en esta build.');
      const userId = session?.user?.id;
      if (!userId) throw new Error('No hay sesión activa. Vuelve a iniciar sesión.');
      try {
        await saveProfileData(userId, userProfileToPatch(nextProfile));
        dispatch({ type: 'SET_USER_PROFILE', payload: nextProfile });
      } catch (err) {
        console.error('[MockStore] persistUserProfile error:', err);
        throw err;
      }
    },
    emitNotification: (serviceId, title) => {
      if (state.notifiedServiceIds.has(serviceId)) return false;
      dispatch({ type: 'MARK_NOTIFIED', payload: { serviceId } });
      Vibration.vibrate?.(200);
      notifyHighPriority(
        'Nueva alerta de servicio',
        title || 'Tienes un nuevo servicio disponible',
        { serviceId, type: 'NEW_SERVICE' }
      );
      return true;
    },
    emitChatNotification: (title, body, data) => {
      Vibration.vibrate?.(200);
      notifyHighPriority(title, body || '', data ?? { type: 'CHAT' });
    },
    startProviderChat: async (serviceId, driverId) => {
      await persistApplication(serviceId, driverId, {
        providerChatStarted: true,
        seenByDriver: false,
      });
      dispatch({ type: 'START_PROVIDER_CHAT', payload: { serviceId, driverId } });
    },
    markDriverSeenChat: async (serviceId, driverId) => {
      await persistApplication(serviceId, driverId, { seenByDriver: true });
      dispatch({ type: 'MARK_DRIVER_SEEN_CHAT', payload: { serviceId, driverId } });
    },
    enableSettlement: async (serviceId) => {
      // El cuadre actual (0013) no usa esta bandera: se conserva por compatibilidad.
      dispatch({ type: 'ENABLE_SETTLEMENT', payload: { serviceId } });
    },
    advanceDriverProgress: async (serviceId) => {
      const service = state.services.find((s) => s.id === serviceId);
      // El paso se calcula sobre el estado actual y la base solo permite avanzar.
      const paso = Math.min((service?.driver_progress_step ?? 0) + 1, 3);
      const ok = await reportarAvance(serviceId, paso);
      if (!ok) return false;
      dispatch({ type: 'ADVANCE_DRIVER_PROGRESS', payload: { serviceId } });
      return true;
    },
  };

  return <MockContext.Provider value={value}>{children}</MockContext.Provider>;
}

export const useMockStore = () => {
  const ctx = useContext(MockContext);
  if (!ctx) throw new Error('useMockStore must be used within MockStoreProvider');
  return ctx;
};
