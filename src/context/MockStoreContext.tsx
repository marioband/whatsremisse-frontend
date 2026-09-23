import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  ReactNode,
  useRef,
  useState,
} from 'react';

import { useAuth } from './AuthContext';
import { useAlVolverALaApp } from '../hooks/useAlVolverALaApp';
import { useRealtimeApplications } from '../hooks/useRealtimeApplications';
import { useRealtimeGroups } from '../hooks/useRealtimeGroups';
import { useRealtimeServices } from '../hooks/useRealtimeServices';
import { Alert } from '../lib/alert';
import { avisarDePostulacion, avisarDeServicioNuevo } from '../lib/avisos';
import { guardarCache, leerCache } from '../lib/cache';
import {
  approveApplicationInDb,
  borrarMiPostulacion,
  fetchApplicationsForDriver,
  fetchApplicationsForProvider,
  fetchGroupMembers,
  fetchGroupsForUser,
  deleteServiceAlert,
  marcarArranqueDelViaje as marcarArranqueEnDb,
  reportarProgresoDelConductor,
  archivarServicio,
  esFuncionAusente,
  declararPagoDelServicio as declararPagoEnDb,
  resolverDeclaracionDePago as resolverDeclaracionEnDb,
  confirmarPagoDelServicio as confirmarPagoEnDb,
  compartirServicioConGrupos as compartirServicioEnDb,
  fetchGruposDeServicios,
  fetchServicesForDriver,
  fetchGruposSinLeer,
  fetchServiciosSinLeer,
  fetchServicesForProvider,
  fetchServiceAlertById,
  postularAServicio,
  cambiarFotoDelGrupo,
  cambiarNombreDelGrupo,
  insertGroup,
  insertGroupMember,
  insertServiceAlert,
  rejectApplicationInDb,
  rejectApplicationFromDb,
  removeGroupMember,
  salirDeUnGrupo,
  deleteGroup,
  saveProfileData,
  updateApplication,
  updateGroupMember,
  updateServiceAlert,
  ProfilePatch,
} from '../lib/database';
import { Candado, claveDeEnvio, crearCandado } from '../lib/envioUnico';
import { describeError, esFalloDeTransporte, textoDeErrorParaElUsuario } from '../lib/errors';
import { conGrupos } from '../lib/gruposDeServicio';
import {
  guardarHuellasDePostulacion,
  leerHuellasDePostulacion,
  marcarPostulacion,
} from '../lib/marcaDePostulacion';
import {
  emergenciasCercanas,
  esEmergenciaCercaDeMi,
  leerEmergenciasActivas,
} from '../lib/emergencias';
import { ultimaUbicacion } from '../lib/geolocation';
import { esPremium } from '../lib/premium';
import { registrarTokenDePush } from '../lib/pushToken';
import {
  fusionarLista,
  fusionarServicio,
  hitoAdelantado,
  pasoConfirmado,
  pasoDelSiguienteHito,
} from '../lib/serviciosSincronizados';
import { isSupabaseConfigured } from '../lib/supabase';
import { unidadesDeMiPerfil } from '../lib/unidades';
import { isVisibleAsDriver, isVisibleAsProvider } from '../lib/visibility';
import { Application, ServiceAlert, ServiceStatus, Message, AppRole, Profile } from '../types';

export interface GroupItem {
  /** Si este usuario silenció los avisos del chat de este grupo (migración 0028). */
  muted?: boolean;
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
  favorite: boolean;
  /** Creador del grupo (groups.owner_id): manda por encima del rol de miembro. */
  ownerId?: string;
  /** Foto del grupo (0038), si tiene. Sin ella la tarjeta pinta la inicial. */
  avatarUrl?: string | null;
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
  /**
   * Las unidades del conductor (19-09-2026: puede tener VARIAS; antes era `vehicleType`,
   * un solo texto). Se guardan en `vehicle_data.vehicle_type` y el inicio del conductor
   * muestra la alerta si comparte alguna unidad con lo que pide el servicio.
   */
  vehicleTypes: string[];
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
  /** 0039: billetera elegida (YAPE, PLIN, BIM, OTRO), su nombre si es OTRO, y el banco. */
  billeteraTipo?: string;
  billeteraNombre?: string;
  bancoNombre?: string;
  /** 0042: recibir avisos de emergencias cercanas de grupos que no integra (por defecto, no). */
  recibirEmergencias?: boolean;
}

interface MockState {
  role: AppRole;
  /** Mensajes sin leer por grupo (`grupos_sin_leer`, 0028). */
  sinLeerDeGrupos: Record<string, number>;
  /** Mensajes sin leer por conversación de servicio (`servicios_sin_leer`, 0040), clave `serviceId|driverId`. */
  sinLeerDeServicios: Record<string, number>;
  services: ServiceAlert[];
  applications: Application[];
  chats: Record<string, Message[]>;
  groups: GroupItem[];
  members: Record<string, GroupMember[]>;
  userProfile: UserProfile | null;
  driverDebt: number;
  debtThreshold: number;
}

type MockAction =
  | { type: 'SET_ROLE'; payload: AppRole }
  | { type: 'SET_GROUPS'; payload: GroupItem[] }
  | {
      type: 'SET_SIN_LEER';
      payload: { grupos: Record<string, number>; servicios: Record<string, number> };
    }
  | { type: 'SET_MEMBERS'; payload: { groupId: string; members: GroupMember[] } }
  | { type: 'SET_SERVICES'; payload: ServiceAlert[] }
  | { type: 'SET_APPLICATIONS'; payload: Application[] }
  | { type: 'ADD_SERVICE'; payload: ServiceAlert }
  | { type: 'UPDATE_SERVICE'; payload: ServiceAlert }
  | { type: 'UPDATE_APPLICATION'; payload: Application }
  | { type: 'APPLY_TO_SERVICE'; payload: { serviceId: string; driverId: string } }
  | { type: 'UPSERT_APPLICATION'; payload: Application }
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
  /** Cambió el nombre y/o la foto del grupo (0044, creador o administrador). */
  | { type: 'EDIT_GROUP'; payload: { groupId: string; name?: string; avatarUrl?: string | null } }
  | { type: 'ADD_MEMBER'; payload: GroupMember }
  | {
      type: 'UPDATE_MEMBER_ROLE';
      payload: { groupId: string; memberId: string; role: 'owner' | 'admin' | 'member' };
    }
  | { type: 'REMOVE_MEMBER'; payload: { groupId: string; memberId: string } }
  | { type: 'REMOVE_GROUP'; payload: { groupId: string } }
  | { type: 'SET_USER_PROFILE'; payload: UserProfile }
  | { type: 'START_PROVIDER_CHAT'; payload: { serviceId: string; driverId: string } }
  | { type: 'MARK_DRIVER_SEEN_CHAT'; payload: { serviceId: string; driverId: string } };

/** Cada cuánto se rehace la carga completa como respaldo del tiempo real. */
const REFRESCO_MS = 15000;

const initialState: MockState = {
  role: 'DRIVER',
  sinLeerDeGrupos: {},
  sinLeerDeServicios: {},
  services: [],
  applications: [],
  chats: {},
  groups: [],
  members: {},
  userProfile: null,
  driverDebt: 0,
  debtThreshold: 100,
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

    case 'SET_SIN_LEER':
      return {
        ...state,
        sinLeerDeGrupos: action.payload.grupos,
        sinLeerDeServicios: action.payload.servicios,
      };

    case 'SET_SERVICES':
      // La lista entrante decide QUÉ servicios se ven; de cada uno se conserva la
      // versión más nueva (una lectura que llegó tarde no puede hacer retroceder
      // el viaje ni el cuadre de pagos).
      return { ...state, services: fusionarLista(state.services, action.payload) };

    case 'SET_APPLICATIONS':
      return { ...state, applications: action.payload };

    case 'ADD_SERVICE': {
      const existente = state.services.find((s) => s.id === action.payload.id);
      const fila = fusionarServicio(existente, action.payload);
      return {
        ...state,
        services: existente
          ? state.services.map((s) => (s.id === fila.id ? fila : s))
          : [fila, ...state.services],
      };
    }

    case 'UPDATE_SERVICE': {
      const actual = state.services.find((s) => s.id === action.payload.id);
      const fila = fusionarServicio(actual, action.payload);
      return {
        ...state,
        services: state.services.map((s) => (s.id === fila.id ? fila : s)),
      };
    }

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
      // Respaldo local (sin Supabase configurado). El puesto real lo asigna la
      // base; aquí se replica su regla contando SOLO las postulaciones vigentes,
      // porque contar las anuladas era justo lo que hacía salir "Postulante N° 2"
      // al primero de la tarjeta.
      const existingCount = state.applications.filter(
        (a) => a.serviceId === action.payload.serviceId && a.status === 'PENDING'
      ).length;
      // OJO: aquí NO se toca `services`. La alerta sigue abierta en la base hasta
      // que el proveedor acepta a un conductor, así que la tarjeta tiene que
      // quedarse a la vista de todos. Antes este reducer le ponía un estado local
      // 'STATUS_PENDING_APPROVAL' (que no existe como columna) y la tarjeta
      // desaparecía del dispositivo de todos —incluso de quien no había postulado—
      // porque el aviso de "otro postuló" llegaba por el canal de tiempo real.
      return {
        ...state,
        applications: [
          ...state.applications.filter(
            (a) =>
              !(a.serviceId === action.payload.serviceId && a.driverId === action.payload.driverId)
          ),
          {
            serviceId: action.payload.serviceId,
            driverId: action.payload.driverId,
            status: 'PENDING',
            // La base (y el upsert de postularAServicio) refrescan `created_at` en cada
            // postulación; en el camino sin Supabase se replica para que la regla del
            // rechazo (ver listaDelConductor) tenga la misma marca.
            createdAt: new Date().toISOString(),
            order: existingCount + 1,
          },
        ],
      };
    }

    case 'UPSERT_APPLICATION': {
      // Alta/actualización de una postulación sin tocar `services`: es lo que usa el
      // canal de tiempo real, donde llegan postulaciones de otros conductores.
      const { serviceId, driverId } = action.payload;
      const yaEsta = state.applications.some(
        (a) => a.serviceId === serviceId && a.driverId === driverId
      );
      return {
        ...state,
        applications: yaEsta
          ? state.applications.map((a) =>
              a.serviceId === serviceId && a.driverId === driverId ? { ...a, ...action.payload } : a
            )
          : [...state.applications, action.payload],
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
      // Tampoco aquí se inventa un estado para el servicio: anular la postulación no
      // cambia la alerta (sigue abierta para los demás). El conteo de postulantes de
      // la tarjeta del proveedor sale de las postulaciones, no del estado.
      return { ...state, applications: remainingApplications };
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

    case 'EDIT_GROUP':
      return {
        ...state,
        groups: state.groups.map((g) =>
          g.id === action.payload.groupId
            ? {
                ...g,
                ...(action.payload.name !== undefined ? { name: action.payload.name } : {}),
                ...(action.payload.avatarUrl !== undefined
                  ? { avatarUrl: action.payload.avatarUrl }
                  : {}),
              }
            : g
        ),
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

    case 'REMOVE_GROUP': {
      // El grupo se va con sus integrantes y su conversación (la base los borra en cascada).
      const { [action.payload.groupId]: _fuera, ...membersRestantes } = state.members;
      return {
        ...state,
        groups: state.groups.filter((g) => g.id !== action.payload.groupId),
        members: membersRestantes,
      };
    }

    case 'SET_USER_PROFILE':
      return { ...state, userProfile: action.payload };

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
  /**
   * Publica una tarjeta. Con `groupIds` la comparte a TODOS esos grupos en un solo
   * servicio (0018): antes se creaba una tarjeta por grupo y el conductor que estaba
   * en varios grupos recibía la misma alerta varias veces. Devuelve el id real (el
   * de la base) o `null` si no se pudo publicar.
   */
  addService: (service: ServiceAlert, groupIds?: string[]) => Promise<string | null>;
  /**
   * Comparte una tarjeta que ya existe con los grupos elegidos (0018). Reemplaza el
   * conjunto completo: un array vacío deja la tarjeta como "Servicio no compartido".
   */
  compartirServicio: (serviceId: string, groupIds: string[]) => Promise<boolean>;
  updateService: (service: ServiceAlert) => Promise<boolean>;
  /** Anula la tarjeta: la borra de la base y de la lista. */
  deleteService: (serviceId: string) => Promise<boolean>;
  /** Postularme a una alerta. Es asíncrona (escribe la fila y devuelve el puesto). */
  applyToService: (serviceId: string, driverId: string) => Promise<void>;
  approveApplication: (serviceId: string, driverId: string) => void;
  /**
   * ¿Se acaba de empezar a aceptar a este conductor? (23-09-2026)
   *
   * `approveApplication` espera a que la base confirme y DESPUÉS refresca el estado local. Si el
   * proveedor acepta en la lista de postulantes, el chat se abre en el acto con el estado viejo (la
   * postulación todavía PENDING) y pinta un instante los botones Aceptar/Rechazar, que ya no tocan.
   * Con esta marca, el chat sabe que esa aceptación está en camino y no los pinta.
   */
  esAceptacionRecienEmpezada: (serviceId: string, driverId: string) => boolean;
  rejectApplication: (serviceId: string) => void;
  rejectApplicationFrom: (serviceId: string, driverId: string) => void;
  /** Devuelve false si la base no confirmó el borrado (la postulación sigue en pie). */
  cancelApplication: (serviceId: string, driverId: string) => Promise<boolean>;
  updateServiceStatus: (serviceId: string, status: ServiceStatus) => void;
  /**
   * El toque "Servicio aceptado, toca para iniciar" del conductor (0022): deja la marca
   * en la base para que el PROVEEDOR vea lo mismo. No es un hito (`driver_progress_step`
   * no cambia) y no bloquea nada si falla: en el teléfono queda la marca local.
   */
  marcarArranqueDelViaje: (serviceId: string) => Promise<void>;
  archiveService: (serviceId: string) => void;
  unarchiveService: (serviceId: string) => void;
  addMessage: (serviceId: string, message: Message) => void;
  addDriverDebt: (amount: number) => void;
  reduceDriverDebt: (amount: number) => void;
  setDebtThreshold: (amount: number) => void;
  loadGroupMembers: (groupId: string) => Promise<void>;
  reloadGroups: () => Promise<void>;
  /**
   * Relee servicios y postulaciones de Supabase ahora mismo. Lo usa el chat del
   * servicio: el ciclo de pago (declaración, rechazo, confirmación) tiene que
   * verse al abrirlo, sin esperar al respaldo periódico del store.
   */
  refrescar: () => void;
  /**
   * Relee UNA fila de servicio y la deja en el store. Es la red del chat: quien
   * rechaza o acepta el monto es el otro dispositivo, así que el conductor no
   * puede depender solo del tiempo real para enterarse.
   */
  refrescarServicio: (serviceId: string) => Promise<void>;
  /** Pago del servicio (migración 0013): declaración, resolución y confirmación. */
  declararPago: (
    serviceId: string,
    direccion: 'DRIVER_PAYS_PROVIDER' | 'PROVIDER_PAYS_DRIVER',
    monto: number
  ) => Promise<boolean>;
  resolverDeclaracionDePago: (serviceId: string, aceptar: boolean) => Promise<boolean>;
  confirmarPagoRecibido: (serviceId: string) => Promise<boolean>;
  toggleFavoriteGroup: (groupId: string) => void;
  /** Crea el grupo y devuelve el grupo creado (su id hace falta para meter a los integrantes). */
  addGroup: (group: GroupItem) => Promise<GroupItem>;
  /**
   * Cambia el nombre y/o la foto del grupo (23-09-2026). Puede el creador o un administrador: lo
   * decide la función `cambiar_nombre_del_grupo` / `cambiar_foto_del_grupo` de la 0044.
   * Devuelve true si la base lo guardó.
   */
  editarGrupo: (
    groupId: string,
    cambios: { nombre?: string; avatarUrl?: string | null }
  ) => Promise<boolean>;
  /** Elimina el grupo entero (solo su creador). Devuelve false si la base no lo borró. */
  eliminarGrupo: (groupId: string) => Promise<boolean>;
  addMember: (member: GroupMember) => void;
  updateMemberRole: (groupId: string, memberId: string, role: 'owner' | 'admin' | 'member') => void;
  /** Devuelve false si la base no confirmó el borrado (para no navegar como si hubiera funcionado). */
  removeMember: (groupId: string, memberId: string) => Promise<boolean>;
  /** Irse del grupo por mi cuenta (borra MI fila); el creador no puede: para él está eliminar. */
  salirDelGrupo: (groupId: string) => Promise<boolean>;
  /**
   * Relee SOLO los contadores de sin leer (grupos y conversaciones de servicio). Lo usan las
   * pantallas que necesitan el número al instante —Mis grupos al volver y al llegar un mensaje en
   * vivo— sin recargar toda la app.
   */
  refrescarSinLeer: () => Promise<void>;
  setUserProfile: (profile: UserProfile) => void;
  persistUserProfile: (profile: UserProfile) => Promise<void>;
  startProviderChat: (serviceId: string, driverId: string) => void;
  markDriverSeenChat: (serviceId: string, driverId: string) => void;
  enableSettlement: (serviceId: string) => void;
  /**
   * Reporta el hito siguiente del viaje. Devuelve el paso que quedó escrito en la
   * base (1..3) o `null` si no se pudo reportar. Antes devolvía `boolean` y el
   * paso se sumaba también en local: el store quedaba un hito por delante de la
   * base y el cuadre de pagos se adelantaba.
   */
  advanceDriverProgress: (serviceId: string) => Promise<number | null>;
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
    vehicleTypes: unidadesDeMiPerfil(vehicle.vehicle_type),
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
    // 0039: sin la migración estas columnas no vienen y quedan en undefined (etiquetas genéricas).
    billeteraTipo: profile.billetera_tipo || undefined,
    billeteraNombre: profile.billetera_nombre || undefined,
    bancoNombre: profile.banco_nombre || undefined,
    // 0042: sin la migración la columna no viene y queda en false (nadie recibe emergencias).
    recibirEmergencias: profile.recibir_emergencias === true,
  };
}

/** Convierte el perfil de las pantallas en el patch que se guarda en `profiles`. */
function userProfileToPatch(profile: UserProfile): ProfilePatch {
  const year = profile.year ? Number.parseInt(profile.year, 10) : NaN;

  return {
    full_name: `${profile.firstName} ${profile.lastName}`.trim() || null,
    phone: profile.phone || null,
    vehicle_data: {
      vehicle_type: profile.vehicleTypes,
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
    billetera_tipo: profile.billeteraTipo || null,
    billetera_nombre: profile.billeteraNombre || null,
    banco_nombre: profile.bancoNombre || null,
    // Solo se manda si está decidido: así guardar otros datos no apaga la marca sin querer.
    ...(profile.recibirEmergencias === undefined
      ? {}
      : { recibir_emergencias: profile.recibirEmergencias === true }),
  };
}

export function MockStoreProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth();
  const [state, dispatch] = useReducer(mockReducer, initialState);
  const loadedRef = useRef(false);
  /** Los ids de las emergencias cercanas que le tocan (0041/0042); se recalcula en cada carga. */
  const emergenciasCercaRef = useRef<string[]>([]);
  /**
   * Candado de los envíos a la base: la misma publicación o el mismo compartir SOLO
   * se ejecuta una vez mientras está en vuelo; quien insista recibe la misma promesa.
   * Es la red que no depende de la pantalla (varias pantallas publican y un toque
   * repetido no debe crear dos alertas del mismo servicio).
   */
  const candadoDeEnvio = useRef<Candado>(crearCandado());

  /**
   * «Acabo de empezar a aceptar a este conductor»: servicio+conductor → cuándo se tocó.
   *
   * Es un ref (no estado) a propósito: solo tiene que tapar la ventana entre el toque y la respuesta
   * de la base, y no debe provocar renders. Si la escritura falla, la ventana se cierra sola al
   * pasar el tiempo y el aviso del error ya se habrá enseñado.
   */
  const aceptacionesEnCurso = useRef<Map<string, number>>(new Map());
  /** Cuánto tapa la ventana: de sobra para la escritura (mediana ~200 ms) sin quedarse colgada. */
  const VENTANA_DE_ACEPTACION_MS = 6000;
  const esAceptacionRecienEmpezada = useCallback(
    (serviceId: string, driverId: string) => {
      const cuando = aceptacionesEnCurso.current.get(`${serviceId}:${driverId}`);
      return cuando !== undefined && Date.now() - cuando < VENTANA_DE_ACEPTACION_MS;
    },
    []
  );

  /**
   * La caché del teléfono sirve para PINTAR al instante y refrescar por detrás (20-09-2026).
   *
   * POR QUÉ: al volver a la app (o al reabrirla, que es lo que hace iOS con una PWA después de
   * un rato fuera) la pantalla aparecía vacía esperando a la red —«aún hay una carga», dijo el
   * usuario—. Con lo último que se sabía se pinta el inicio de inmediato y la consulta de
   * verdad lo corrige un momento después. La clave lleva el id del usuario: los datos de una
   * cuenta nunca se pintan en la pantalla de otra.
   */
  const TTL_DE_LA_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

  const claveDeCache = (nombre: string, userId: string) => `${nombre}:${userId}`;

  /** Pinta grupos, servicios y postulaciones de la última vez que se abrió la app. */
  const hidratarDelTelefono = useCallback(async (userId: string) => {
    const [grupos, servicios, postulaciones] = await Promise.all([
      leerCache<GroupItem[]>(claveDeCache('grupos', userId), TTL_DE_LA_CACHE_MS),
      leerCache<ServiceAlert[]>(claveDeCache('servicios', userId), TTL_DE_LA_CACHE_MS),
      leerCache<Application[]>(claveDeCache('postulaciones', userId), TTL_DE_LA_CACHE_MS),
    ]);
    if (grupos?.length) dispatch({ type: 'SET_GROUPS', payload: grupos });
    if (servicios?.length) dispatch({ type: 'SET_SERVICES', payload: servicios });
    if (postulaciones?.length) dispatch({ type: 'SET_APPLICATIONS', payload: postulaciones });
  }, []);

  /**
   * Relee de Supabase grupos, servicios (de las dos identidades) y postulaciones.
   * Vive fuera de los efectos porque la usan dos: la carga inicial y el respaldo
   * periódico. Lo que trae se guarda en el teléfono para el próximo arranque.
   */
  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !session?.user || !profile) return;
    try {
      const groups = await fetchGroupsForUser(profile.id);
      dispatch({ type: 'SET_GROUPS', payload: groups });
      guardarCache(claveDeCache('grupos', profile.id), groups);
      const groupIds = groups.map((g) => g.id);

      // Las dos identidades conviven en la misma cuenta: el usuario puede
      // publicar servicios como proveedor y recibir alertas como conductor.
      // 0041/0042: si pidió recibir emergencias cercanas (y es premium), se traen también las de
      // grupos a los que no pertenece. El «cerca de él» (15 km) se decide después, con su
      // ubicación, en `lib/emergencias.ts`.
      const emergenciasActivas = esPremium(profile) && leerEmergenciasActivas(profile);
      const [providerServices, driverServices] = await Promise.all([
        fetchServicesForProvider(profile.id),
        fetchServicesForDriver(profile.id, groupIds, emergenciasActivas),
      ]);
      const servicesById = new Map<string, ServiceAlert>();
      [...providerServices, ...driverServices].forEach((s) => servicesById.set(s.id, s));
      const servicios = [...servicesById.values()];
      dispatch({ type: 'SET_SERVICES', payload: servicios });
      guardarCache(claveDeCache('servicios', profile.id), servicios);
      // Las que le tocan AHORA: es lo que la lista y los contadores dejan pasar aunque no sean de
      // sus grupos (el tiempo real usa esta misma lista para no descartarlas).
      emergenciasCercaRef.current = emergenciasActivas
        ? emergenciasCercanas(servicios, ultimaUbicacion())
        : [];

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
      const postulaciones = [...applicationsByKey.values()];
      dispatch({ type: 'SET_APPLICATIONS', payload: postulaciones });
      guardarCache(claveDeCache('postulaciones', profile.id), postulaciones);

      // Los contadores de sin leer (los números de los botones del inicio): los grupos desde la
      // 0028 y las conversaciones de servicio desde la 0040. Si falta alguna migración, su mapa
      // llega vacío y el contador de ese apartado se queda en las novedades de las tarjetas.
      const [sinLeerDeGrupos, sinLeerDeServicios] = await Promise.all([
        fetchGruposSinLeer(),
        fetchServiciosSinLeer(),
      ]);
      dispatch({
        type: 'SET_SIN_LEER',
        payload: { grupos: sinLeerDeGrupos, servicios: sinLeerDeServicios },
      });
    } catch (err) {
      console.error('[MockStore] Error loading from Supabase:', err);
    }
  }, [session?.user, profile]);

  // Carga inicial (una sola vez por sesión): primero lo guardado —la pantalla se pinta en el
  // acto— y en seguida la consulta de verdad, que manda.
  useEffect(() => {
    if (!isSupabaseConfigured || !session?.user || !profile || loadedRef.current) return;
    loadedRef.current = true;
    hidratarDelTelefono(profile.id);
    load();
  }, [load, session?.user, profile, hidratarDelTelefono]);

  // Respaldo de sincronización: si el proyecto no tiene activado el tiempo real
  // (falta aplicar la migración 0011), las tarjetas y el pago se refrescan igual
  // cada REFRESCO_MS. OJO: esto tiene que vivir en su PROPIO efecto. Antes el
  // `setInterval` estaba dentro del efecto de carga inicial, que se vuelve a
  // ejecutar cuando cambia la identidad de `session.user` o de `profile` (un
  // refresco de token basta): su limpieza apagaba el intervalo y el guard
  // `loadedRef` impedía volver a crearlo, así que el dispositivo se quedaba SIN
  // respaldo para siempre y solo se enteraba de lo que trajera el tiempo real.
  useEffect(() => {
    if (!isSupabaseConfigured || !session?.user || !profile) return;
    const intervalo = setInterval(() => {
      load();
    }, REFRESCO_MS);
    return () => clearInterval(intervalo);
  }, [load, session?.user, profile]);

  // Hidrata los datos del perfil (nombres, DNI, vehículo, fotos y datos de pago)
  // desde Supabase: antes vivían solo en memoria y se perdían al recargar la app.
  const hydratedUserIdRef = useRef<string | null>(null);

  /** Relectura a demanda (la usa el chat del servicio al abrirse). */
  const refrescar = useCallback(() => {
    load();
  }, [load]);

  /** Solo los contadores de sin leer (grupos + conversaciones de servicio). */
  const refrescarSinLeer = useCallback(async () => {
    if (!isSupabaseConfigured || !session?.user) return;
    try {
      const [grupos, servicios] = await Promise.all([
        fetchGruposSinLeer(),
        fetchServiciosSinLeer(),
      ]);
      dispatch({ type: 'SET_SIN_LEER', payload: { grupos, servicios } });
    } catch (err) {
      console.warn('[MockStore] no se pudieron releer los contadores de sin leer:', err);
    }
  }, [session?.user]);

  /**
   * Relectura de UNA fila. El conductor no puede enterarse del rechazo o de la
   * aceptación del monto por su cuenta: lo escribe el proveedor. Esto lo pone en
   * el store en cuanto llegue, sin esperar al respaldo periódico.
   */
  const refrescarServicio = useCallback(async (serviceId: string) => {
    if (!isSupabaseConfigured) return;
    try {
      const fila = await fetchServiceAlertById(serviceId);
      if (fila) dispatch({ type: 'UPDATE_SERVICE', payload: fila });
    } catch (err) {
      console.warn('[MockStore] no se pudo releer el servicio:', err);
    }
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    if (hydratedUserIdRef.current === profile.id) return;
    hydratedUserIdRef.current = profile.id;
    dispatch({ type: 'SET_USER_PROFILE', payload: userProfileFromAuthProfile(profile) });
  }, [profile]);

  // Sincronización en tiempo real: las tarjetas aparecen y desaparecen en los
  // dos dispositivos sin recargar.
  //
  // `generacionDeVuelta` sube cada vez que la app VUELVE del fondo (Safari del iPhone
  // congela la pestaña en cuanto sales: abrir Waze, cambiar de app, bloquear la pantalla,
  // y al volver la conexión está muerta sin avisar). Al subir, los tres canales se
  // vuelven a levantar (sus deps la incluyen) y además se releen los datos en el acto, sin
  // esperar al respaldo de 15 s: era el "tarda unos segundos en aparecer el postulante".
  const [generacionDeVuelta, setGeneracionDeVuelta] = useState(0);
  useAlVolverALaApp(
    useCallback(() => {
      setGeneracionDeVuelta((n) => n + 1);
      load();
    }, [load])
  );

  useRealtimeServices(async (cambio) => {
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
    //
    // La fila del canal NO trae a qué grupos está compartida (0018): se resuelve con
    // la que ya tenemos en memoria o, si el servicio es nuevo para este dispositivo,
    // preguntando a la base. Sin esto, una alerta compartida a un grupo que no es el
    // principal se descartaría y el conductor no se enteraría hasta el respaldo.
    const groupIds = state.groups.map((g) => g.id);
    const myId = profile?.id;
    const enMemoria = state.services.find((s) => s.id === service.id);
    let fila = service;

    if (enMemoria?.shared_group_ids?.length) {
      fila = conGrupos(service, enMemoria.shared_group_ids);
    } else if (!enMemoria && service.status === 'STATUS_OPEN') {
      try {
        const mapa = await fetchGruposDeServicios([service.id]);
        const ids = mapa.get(service.id);
        if (ids && ids.length > 0) fila = conGrupos(service, ids);
      } catch (err) {
        console.warn('[MockStore] no se pudieron leer los grupos del servicio nuevo:', err);
      }
    }

    // Una emergencia cercana que este conductor pidió recibir entra aunque no sea de sus grupos
    // (0042). Se comprueba la que acaba de llegar y las que ya tenía.
    const emergenciasAqui =
      esPremium(profile) && leerEmergenciasActivas(profile)
        ? [
            ...emergenciasCercaRef.current,
            ...(esEmergenciaCercaDeMi(fila, ultimaUbicacion()) ? [fila.id] : []),
          ]
        : [];

    const isRelevant =
      isVisibleAsProvider(fila, myId) || isVisibleAsDriver(fila, myId, groupIds, emergenciasAqui);
    if (!isRelevant) return;

    const exists = !!enMemoria;
    dispatch({ type: exists ? 'UPDATE_SERVICE' : 'ADD_SERVICE', payload: fila });

    // Al conductor le acaban de compartir un servicio: se le avisa en el momento.
    // Es el aviso de CADA TARJETA de servicio, y va al que la recibe (el proveedor
    // que la publica no se avisa a sí mismo). Una alerta compartida a varios grupos
    // es UNA fila: un solo aviso.
    if (cambio.evento === 'INSERT' && fila.provider_id !== myId) {
      avisarDeServicioNuevo(fila.title, { serviceId: fila.id });
    }
  }, generacionDeVuelta);

  useRealtimeGroups(
    session?.user?.id,
    (group) => {
      const exists = state.groups.some((g) => g.id === group.id);
      const next = exists
        ? state.groups.map((g) => (g.id === group.id ? group : g))
        : [...state.groups, group];
      dispatch({ type: 'SET_GROUPS', payload: next });
    },
    generacionDeVuelta
  );

  // Avisos con la app CERRADA: el dispositivo registra su token de Expo Push en cuanto hay
  // sesión (el push real lo manda la base, migración 0025). En web no hay token.
  useEffect(() => {
    const id = profile?.id;
    if (!id) return;
    registrarTokenDePush(id).catch(() => undefined);
  }, [profile?.id]);

  useRealtimeApplications((cambio) => {
    if (cambio.evento === 'DELETE') {
      dispatch({
        type: 'REMOVE_APPLICATION',
        payload: { serviceId: cambio.serviceId, driverId: cambio.driverId },
      });
      return;
    }

    const application = cambio.aplicacion;
    // Alta/actualización neutra: por aquí llegan postulaciones de OTROS conductores,
    // así que no puede cambiar el estado de la tarjeta en este dispositivo.
    const previa = state.applications.find(
      (a) => a.serviceId === application.serviceId && a.driverId === application.driverId
    );
    dispatch({ type: 'UPSERT_APPLICATION', payload: application });

    // Avisos de las postulaciones (parte del PROCESO del servicio): la postulación
    // nueva la recibe el proveedor del servicio y la aceptación el conductor que se
    // postuló. Antes la aceptación se avisaba en el teléfono del proveedor (el que
    // acepta), así que el conductor no se enteraba nunca.
    const miId = session?.user?.id ?? null;
    const servicio = state.services.find((s) => s.id === application.serviceId);
    if (
      cambio.evento === 'INSERT' &&
      miId &&
      application.driverId !== miId &&
      servicio?.provider_id === miId
    ) {
      avisarDePostulacion({
        aceptada: false,
        tituloDelServicio: servicio.title,
      });
    }
    if (
      cambio.evento === 'UPDATE' &&
      miId &&
      application.driverId === miId &&
      application.status === 'APPROVED' &&
      previa?.status !== 'APPROVED'
    ) {
      avisarDePostulacion({
        aceptada: true,
        tituloDelServicio: servicio?.title,
      });
    }
  }, generacionDeVuelta);

  /**
   * Devuelve si la base ACEPTÓ el cambio (mismo patrón que `escribirServicio`). Antes
   * atrapaba el error y solo lo dejaba en consola, así que quien llama despachaba el
   * cambio local igual: la pantalla daba el servicio por guardado y al refrescar volvía
   * el valor viejo.
   */
  const persistService = async (
    serviceId: string,
    updates: Partial<ServiceAlert>
  ): Promise<boolean> => {
    if (!isSupabaseConfigured) return true;
    try {
      const actualizado = await updateServiceAlert(serviceId, updates);
      // Sin fila devuelta la base no cambió nada (RLS, sesión): se avisa en vez de dar
      // el guardado por hecho.
      if (!actualizado) {
        Alert.alert(
          'No se pudo guardar el servicio',
          'La base no cambió la tarjeta. Vuelve a intentarlo.'
        );
        return false;
      }
      return true;
    } catch (err) {
      console.error('[MockStore] updateServiceAlert error:', err);
      Alert.alert(
        'No se pudo guardar el servicio',
        detalleDe(err, 'El backend rechazó el guardado')
      );
      return false;
    }
  };

  /**
   * Comparte la tarjeta con esos grupos (RPC de la 0018) y devuelve la fila ya
   * releída CON su lista de grupos: la UI no adivina a qué grupos quedó compartida,
   * y el grupo principal (`group_id`) lo decide la base.
   */
  const compartirYLeer = async (serviceId: string, groupIds: string[]): Promise<ServiceAlert> => {
    await compartirServicioEnDb(serviceId, groupIds);
    const fila = await fetchServiceAlertById(serviceId);
    if (!fila) throw new Error('La base no devolvió el servicio después de compartirlo.');
    const mapa = await fetchGruposDeServicios([serviceId]);
    return conGrupos(fila, mapa.get(serviceId) ?? []);
  };

  const persistApplication = async (
    serviceId: string,
    driverId: string,
    updates: Partial<Application>
  ): Promise<boolean> => {
    if (!isSupabaseConfigured) return true;
    try {
      await updateApplication(serviceId, driverId, updates);
      return true;
    } catch (err) {
      console.error('[MockStore] updateApplication error:', err);
      return false;
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

  const avisoDeMigracion = (archivo: string) =>
    `El backend no encontró la función. Si la migración ${archivo} ya está aplicada, espera unos segundos ` +
    "y reintenta: PostgREST recarga su esquema solo (o fuérzalo con NOTIFY pgrst, 'reload schema';).";

  /** Texto del aviso: el detalle crudo del backend va siempre, para diagnosticar. */
  const detalleDe = (err: unknown, titulo: string, archivo = '0012_reporte_del_conductor.sql') =>
    esFuncionAusente(err)
      ? `${avisoDeMigracion(archivo)}\n\nDetalle: ${describeError(err)}`
      : `${titulo}\n\n${textoDeErrorParaElUsuario(err)}`;

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
      // Sin fila devuelta no se reportó nada: se avisa en vez de dar por hecho el
      // avance (antes se devolvía `true` y el hito se anunciaba sin haberse escrito).
      if (!actualizado) {
        Alert.alert(
          'No se pudo reportar el avance',
          'La base no devolvió el servicio. Revisa que tú seas el conductor asignado y que el viaje no esté ya finalizado.'
        );
        return false;
      }
      dispatch({ type: 'UPDATE_SERVICE', payload: actualizado });
      return true;
    } catch (err) {
      console.error('[MockStore] reportarAvance error:', err);
      /**
       * Fallo de TRANSPORTE: la base pudo aplicar el avance igualmente y perderse la
       * respuesta. Antes esto deshacía un hito que SÍ estaba guardado (y volvía a
       * aparecer al recargar): se lee la fila y, si confirma el paso, se da por bueno.
       */
      if (esFalloDeTransporte(err)) {
        const fila = await fetchServiceAlertById(serviceId).catch(() => null);
        if (fila && pasoConfirmado(fila, paso)) {
          dispatch({ type: 'UPDATE_SERVICE', payload: fila });
          return true;
        }
      }
      Alert.alert('No se pudo reportar el avance', detalleDe(err, 'El backend rechazó el reporte'));
      return false;
    }
  };

  /**
   * Devuelve si la base ACEPTÓ el cambio. Antes no devolvía nada y quien llama
   * despachaba el archivado igual: la tarjeta desaparecía de la pantalla a la vez que
   * salía el aviso de que no se pudo archivar, y todo volvía al recargar. Con `false`
   * el estado local no se toca.
   */
  const archivarSegunRol = async (serviceId: string, archivado: boolean): Promise<boolean> => {
    if (!isSupabaseConfigured) return false;
    try {
      if (esServicioPropio(serviceId)) {
        const guardado = await updateServiceAlert(serviceId, { archived: archivado });
        if (!guardado) {
          Alert.alert('No se pudo archivar', 'La base no cambió la tarjeta.');
          return false;
        }
      } else {
        // El conductor archiva solo para él (service_archives): la bandera del
        // servicio es una sola y ocultarla afectaría al proveedor.
        await archivarServicio(serviceId, archivado);
      }
      return true;
    } catch (err) {
      console.error('[MockStore] archivarSegunRol error:', err);
      Alert.alert('No se pudo archivar', textoDeErrorParaElUsuario(err));
      return false;
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
    addService: async (service, groupIds) => {
      // Un solo envío por borrador: si el usuario pulsa varias veces antes de que
      // termine la carga, todos los toques reciben ESTA misma promesa y se crea una
      // sola alerta (antes se publicaba una por toque).
      const clave = claveDeEnvio(null, service);
      return candadoDeEnvio.current.unaSolaVez(clave, async () => {
        if (!isSupabaseConfigured) {
          dispatch({ type: 'ADD_SERVICE', payload: service });
          return service.id;
        }

        let insertado: ServiceAlert;
        try {
          insertado = await insertServiceAlert(service);
        } catch (err) {
          console.error('[MockStore] insertServiceAlert error:', err);
          Alert.alert(
            'No se pudo publicar el servicio',
            detalleDe(err, 'El backend rechazó la publicación', '0018_servicio_a_varios_grupos.sql')
          );
          return null;
        }

        // Compartida a varios grupos = UNA sola tarjeta (0018).
        if (!groupIds || groupIds.length === 0) {
          dispatch({ type: 'ADD_SERVICE', payload: insertado });
          return insertado.id;
        }

        try {
          const fila = await compartirYLeer(insertado.id, groupIds);
          dispatch({ type: 'ADD_SERVICE', payload: fila });
          return fila.id;
        } catch (err) {
          // La tarjeta YA se publicó (la fila existe): se devuelve su id para no dejarla
          // perdida. Antes se devolvía null y el usuario, al reintentar desde la
          // pantalla, publicaba una SEGUNDA alerta del mismo servicio.
          console.error('[MockStore] compartirYLeer error:', err);
          dispatch({ type: 'ADD_SERVICE', payload: insertado });
          Alert.alert(
            'Servicio publicado sin grupos',
            detalleDe(
              err,
              'La tarjeta se publicó, pero no se pudo compartir con los grupos elegidos. Entra a la tarjeta y elige grupos.',
              '0018_servicio_a_varios_grupos.sql'
            )
          );
          return insertado.id;
        }
      });
    },
    compartirServicio: async (serviceId, groupIds) => {
      if (!isSupabaseConfigured) {
        console.warn('[MockStore] sin backend no hay grupos a los que compartir');
        return false;
      }
      // Mismo candado: dos "Enviar" seguidos comparten una sola vez.
      return candadoDeEnvio.current.unaSolaVez(claveDeEnvio(serviceId), async () => {
        try {
          const fila = await compartirYLeer(serviceId, groupIds);
          dispatch({ type: 'UPDATE_SERVICE', payload: fila });
          return true;
        } catch (err) {
          console.error('[MockStore] compartirServicio error:', err);
          Alert.alert(
            'No se pudo compartir el servicio',
            detalleDe(err, 'El backend rechazó el compartir', '0018_servicio_a_varios_grupos.sql')
          );
          return false;
        }
      });
    },
    updateService: async (service) => {
      // Solo si la base lo guardó: la pantalla que llama anuncia el éxito después.
      if (!(await persistService(service.id, service))) return false;
      dispatch({ type: 'UPDATE_SERVICE', payload: service });
      return true;
    },
    deleteService: async (serviceId) => {
      try {
        await deleteServiceAlert(serviceId);
      } catch (err) {
        console.error('[MockStore] deleteServiceAlert error:', err);
        Alert.alert('No se pudo anular la tarjeta', textoDeErrorParaElUsuario(err));
        return false;
      }
      dispatch({ type: 'REMOVE_SERVICE', payload: { serviceId } });
      return true;
    },
    applyToService: async (serviceId, driverId) => {
      // La huella de la alerta AHORA es la referencia para saber si el proveedor la
      // edita después: es la única forma de distinguir una edición (que descarta la
      // cola, migración 0016) de un rechazo. Ver `lib/marcaDePostulacion.ts`.
      const servicioAqui = state.services.find((s) => s.id === serviceId);

      // Guarda: no se vuelve a postular a un servicio que ya es de alguien. Si el
      // proveedor acaba de aceptar a este conductor y su teléfono todavía no lo sabe,
      // volver a postularse devolvía su fila a PENDING: la tarjeta quedaba como
      // "postulando" y el chat del viaje ya asignado no se podía abrir.
      const miFilaAqui = state.applications.find(
        (a) => a.serviceId === serviceId && a.driverId === driverId
      );
      if (servicioAqui?.assigned_driver_id === driverId || miFilaAqui?.status === 'APPROVED') {
        await refrescar();
        return;
      }
      if (servicioAqui && servicioAqui.status !== 'STATUS_OPEN') {
        Alert.alert('Servicio no disponible', 'Este servicio ya no admite postulaciones.');
        await refrescar();
        return;
      }
      if (servicioAqui) {
        await guardarHuellasDePostulacion(
          marcarPostulacion(await leerHuellasDePostulacion(), serviceId, driverId, servicioAqui)
        );
      }
      if (isSupabaseConfigured) {
        try {
          const fila = await postularAServicio(serviceId, driverId);
          if (fila) {
            // El puesto lo trae la base (trigger de la 0015): la tarjeta se pinta
            // con el número real y no con una suposición del cliente.
            dispatch({ type: 'UPSERT_APPLICATION', payload: fila });
            return;
          }
          // La base respondió SIN error pero sin fila (`.maybeSingle()`): la postulación
          // no quedó registrada. Antes se caía al respaldo local y el conductor veía su
          // tarjeta como postulada mientras el proveedor no lo veía en postulantes.
          Alert.alert(
            'No se pudo postular',
            'La base no registró tu postulación. Vuelve a intentarlo.'
          );
          await refrescar();
          return;
        } catch (err) {
          // Antes el error se tragaba y la tarjeta quedaba pintada como postulada
          // sin fila en la base (el proveedor no veía al postulante).
          console.error('[MockStore] postularAServicio error:', err);
          Alert.alert('No se pudo postular', textoDeErrorParaElUsuario(err));
          return;
        }
      }
      // Solo sin base configurada: respaldo local.
      dispatch({ type: 'APPLY_TO_SERVICE', payload: { serviceId, driverId } });
    },
    approveApplication: async (serviceId, driverId) => {
      // La marca va ANTES de escribir: es lo que impide que el chat pinte los botones viejos en la
      // ventana entre el toque y la respuesta de la base.
      aceptacionesEnCurso.current.set(`${serviceId}:${driverId}`, Date.now());
      if (isSupabaseConfigured) {
        try {
          await approveApplicationInDb(serviceId, driverId);
        } catch (err) {
          // Antes el fallo se quedaba solo en consola: el proveedor veía "aceptado" y
          // el conductor no aparecía aceptado en ningún sitio. Como con el rechazo, se
          // avisa y se dice qué falló.
          console.error('[MockStore] approveApplicationInDb error:', err);
          Alert.alert('No se pudo aceptar al postulante', textoDeErrorParaElUsuario(err));
          return;
        }
      }
      dispatch({ type: 'APPROVE_APPLICATION', payload: { serviceId, driverId } });
    },
    esAceptacionRecienEmpezada,
    rejectApplication: async (serviceId) => {
      if (isSupabaseConfigured) {
        try {
          await rejectApplicationInDb(serviceId);
        } catch (err) {
          // Igual que al aceptar: si la base no lo hizo, la pantalla no puede decir que
          // sí (antes el error quedaba en consola y el postulante desaparecía igual).
          console.error('[MockStore] rejectApplicationInDb error:', err);
          Alert.alert('No se pudo descartar el servicio', textoDeErrorParaElUsuario(err));
          return;
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
          Alert.alert('No se pudo rechazar al postulante', textoDeErrorParaElUsuario(err));
          return;
        }
      }
      dispatch({ type: 'REJECT_APPLICATION_FROM', payload: { serviceId, driverId } });
    },
    cancelApplication: async (serviceId, driverId) => {
      // Desistir de la postulación BORRA la fila (no la marca rechazada): el conductor queda
      // como si no se hubiera postulado —puede volver a postularse— y la tarjeta sigue en
      // «Disponibles». El rechazo del proveedor sí es `REJECTED`, y lo escribe la base.
      if (isSupabaseConfigured) {
        try {
          const borrada = await borrarMiPostulacion(serviceId, driverId);
          if (!borrada) {
            console.warn(
              '[MockStore] no se borró ninguna postulación (¿sesión vencida o política RLS de DELETE?)'
            );
            return false;
          }
        } catch (err) {
          console.error('[MockStore] cancelApplication error:', err);
          return false;
        }
      }
      dispatch({ type: 'CANCEL_APPLICATION', payload: { serviceId, driverId } });
      return true;
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
    marcarArranqueDelViaje: async (serviceId) => {
      if (!isSupabaseConfigured) return;
      try {
        const actualizado = await marcarArranqueEnDb(serviceId);
        if (actualizado) dispatch({ type: 'UPDATE_SERVICE', payload: actualizado });
      } catch (err) {
        // Sin la 0022 aplicada la función no existe: el toque sigue valiendo en el
        // teléfono del conductor (marca local) y el proveedor no lo verá hasta que
        // aplique la migración. No se avisa al conductor: él no tiene que arreglar esto.
        if (esFuncionAusente(err)) {
          console.warn(
            '[MockStore] no se pudo dejar el arranque en la base (¿falta la 0022?):',
            err
          );
          return;
        }
        // Cualquier otro fallo (no ser el conductor asignado, sesión caída) sí importa:
        // el proveedor nunca vería el arranque y la discrepancia no se notaría.
        console.error('[MockStore] marcarArranqueDelViaje error:', err);
        Alert.alert('No se pudo marcar el arranque', textoDeErrorParaElUsuario(err));
      }
    },
    archiveService: async (serviceId) => {
      // Solo si la base lo archivó de verdad.
      if (await archivarSegunRol(serviceId, true))
        dispatch({ type: 'ARCHIVE_SERVICE', payload: { serviceId } });
    },
    unarchiveService: async (serviceId) => {
      if (await archivarSegunRol(serviceId, false))
        dispatch({ type: 'UNARCHIVE_SERVICE', payload: { serviceId } });
    },
    addMessage: (serviceId, message) =>
      dispatch({ type: 'ADD_MESSAGE', payload: { serviceId, message } }),
    addDriverDebt: (amount) => dispatch({ type: 'ADD_DRIVER_DEBT', payload: amount }),
    reduceDriverDebt: (amount) => dispatch({ type: 'REDUCE_DRIVER_DEBT', payload: amount }),
    setDebtThreshold: (amount) => dispatch({ type: 'SET_DEBT_THRESHOLD', payload: amount }),
    loadGroupMembers,
    reloadGroups,
    refrescarSinLeer,
    refrescar,
    refrescarServicio,
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
        // eslint-disable-next-line no-console
        console.error('[MockStore] toggleFavoriteGroup error:', err);
        dispatch({ type: 'TOGGLE_FAVORITE_GROUP', payload: { groupId } });
        // Si falta la 0023 el toque del corazón no se puede guardar (la política UPDATE
        // de group_members exige ser administrador): se revierte y se dice qué aplicar.
        Alert.alert(
          'No se pudo marcar el favorito',
          detalleDe(err, 'El backend rechazó el cambio', '0023_favorito_de_grupo.sql')
        );
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
        const { group: dbGroup, member } = await insertGroup(
          group.name,
          session.user.id,
          // La foto (0038) se manda solo si el usuario eligió una: es opcional de principio a fin.
          group.avatarUrl || null
        );
        const creado: GroupItem = {
          id: dbGroup.id,
          name: dbGroup.name,
          role: member.role as GroupItem['role'],
          favorite: member.favorite,
          ownerId: dbGroup.owner_id,
          // Si la migración 0038 no está aplicada, `insertGroup` guardó el grupo sin foto y aquí
          // no habrá nada: la tarjeta pinta la inicial, que es el respaldo de siempre.
          avatarUrl: dbGroup.avatar_url ?? group.avatarUrl ?? null,
        };
        dispatch({ type: 'ADD_GROUP', payload: creado });
        return creado;
      } catch (err) {
        console.error('[MockStore] addGroup error:', err);
        throw err;
      }
    },
    /**
     * Cambiar el nombre y/o la foto del grupo (23-09-2026).
     *
     * Va por las funciones de la 0044 porque la política de `groups` solo deja escribir al creador y
     * aquí también puede un administrador. Si la base no lo acepta, se explica el motivo y el grupo
     * se queda como estaba (nada de pintar un nombre que no se guardó).
     */
    editarGrupo: async (groupId, cambios) => {
      try {
        let nombre: string | undefined;
        if (cambios.nombre !== undefined) {
          nombre = await cambiarNombreDelGrupo(groupId, cambios.nombre);
        }
        let avatarUrl: string | null | undefined;
        if (cambios.avatarUrl !== undefined) {
          await cambiarFotoDelGrupo(groupId, cambios.avatarUrl);
          avatarUrl = cambios.avatarUrl;
        }
        dispatch({ type: 'EDIT_GROUP', payload: { groupId, name: nombre, avatarUrl } });
        return true;
      } catch (err) {
        console.error('[MockStore] editarGrupo error:', err);
        Alert.alert('No se pudo cambiar el grupo', textoDeErrorParaElUsuario(err));
        return false;
      }
    },
    eliminarGrupo: async (groupId) => {
      try {
        await deleteGroup(groupId);
        dispatch({ type: 'REMOVE_GROUP', payload: { groupId } });
        return true;
      } catch (err) {
        // No se dice «eliminado» si la base no lo borró: se explica el motivo (creador,
        // permisos, conexión) y el grupo sigue en la lista.
        Alert.alert('No se pudo eliminar el grupo', textoDeErrorParaElUsuario(err));
        return false;
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
        Alert.alert('No se pudo cambiar el rol', textoDeErrorParaElUsuario(err));
      }
    },
    removeMember: async (groupId, memberId) => {
      if (esPropietarioDelGrupo(state.groups, state.members, groupId, memberId)) {
        Alert.alert('No permitido', 'No puedes eliminar al propietario.');
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
        Alert.alert('No se pudo eliminar al integrante', textoDeErrorParaElUsuario(err));
        return false;
      }
    },
    /**
     * Salir del grupo (pedido del usuario, 22-09-2026): borra MI fila de `group_members`.
     *
     * El creador no puede salir —su grupo quedaría sin dueño y la base no lo permite—: para él está
     * «Eliminar grupo». Al salir, el grupo desaparece de Mis grupos en el acto y sus avisos dejan de
     * llegarle (los destinatarios salen de `group_members`).
     */
    salirDelGrupo: async (groupId) => {
      const userId = session?.user?.id;
      if (!userId) return false;
      try {
        await salirDeUnGrupo(groupId, userId);
        dispatch({ type: 'REMOVE_MEMBER', payload: { groupId, memberId: userId } });
        dispatch({ type: 'REMOVE_GROUP', payload: { groupId } });
        return true;
      } catch (err) {
        console.error('[MockStore] salirDelGrupo error:', err);
        Alert.alert('No se pudo salir del grupo', textoDeErrorParaElUsuario(err));
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
    startProviderChat: async (serviceId, driverId) => {
      // La marca es la que abre el chat al conductor: si la base no la guardó, no se
      // pinta (el conductor seguiría viendo el chat cerrado hasta recargar).
      const guardado = await persistApplication(serviceId, driverId, {
        providerChatStarted: true,
        seenByDriver: false,
      });
      if (!guardado) {
        Alert.alert(
          'No se pudo abrir el chat',
          'La base no guardó el cambio. Vuelve a intentarlo.'
        );
        return;
      }
      dispatch({ type: 'START_PROVIDER_CHAT', payload: { serviceId, driverId } });
    },
    markDriverSeenChat: async (serviceId, driverId) => {
      // Se llama dentro de un efecto al abrir el chat: si falla, no se avisa (el efecto
      // volvería a intentarlo) y NO se marca como visto lo que la base no guardó.
      if (!(await persistApplication(serviceId, driverId, { seenByDriver: true }))) return;
      dispatch({ type: 'MARK_DRIVER_SEEN_CHAT', payload: { serviceId, driverId } });
    },
    enableSettlement: async (serviceId) => {
      // El cuadre actual (0013) no usa esta bandera: se conserva por compatibilidad.
      dispatch({ type: 'ENABLE_SETTLEMENT', payload: { serviceId } });
    },
    advanceDriverProgress: async (serviceId) => {
      const service = state.services.find((s) => s.id === serviceId);
      // El paso se calcula sobre la fila vigente (la base solo permite avanzar).
      const paso = pasoDelSiguienteHito(service);
      if (!isSupabaseConfigured) {
        // Sin backend no hay fila que confirmar: el paso avanza solo en memoria.
        dispatch({ type: 'ADVANCE_DRIVER_PROGRESS', payload: { serviceId } });
        return paso;
      }
      // ADELANTO LOCAL (optimista): el hito que el conductor acaba de reportar se pinta
      // en el acto —la etiqueta del deslizamiento, la franja del proveedor y las
      // tarjetas del inicio— y no cuando responde la base. Antes se esperaba la
      // respuesta y, mientras tanto, la barra volvía al inicio con el texto VIEJO
      // ("desliza ubicado, el botón regresa y recién unos segundos después aparece en
      // proceso", reportado por el usuario). La fila que devuelve la base manda: si
      // confirma, se aplica tal cual; si falla, se vuelve al valor anterior.
      const adelanto = hitoAdelantado(service, paso);
      if (adelanto) dispatch({ type: 'UPDATE_SERVICE', payload: adelanto });
      // La fila que devuelve la base es la ÚNICA fuente del paso. Aquí NO se suma
      // otra vez en local: ese +1 dejaba el paso un hito por delante de la base, el
      // cuadre de pagos aparecía antes de "Finalizado" y volvía a desaparecer en la
      // siguiente lectura (era el cuadre que "hacía una pequeña aparición" al
      // deslizar y el que reseteaba el formulario del monto).
      const ok = await reportarAvance(serviceId, paso);
      if (!ok && service) {
        // No se pudo escribir: se deshace el adelanto (la franja no puede quedarse
        // mostrando un hito que la base no confirmó).
        dispatch({ type: 'UPDATE_SERVICE', payload: service });
        return null;
      }
      return ok ? paso : null;
    },
  };

  return <MockContext.Provider value={value}>{children}</MockContext.Provider>;
}

export const useMockStore = () => {
  const ctx = useContext(MockContext);
  if (!ctx) throw new Error('useMockStore must be used within MockStoreProvider');
  return ctx;
};
