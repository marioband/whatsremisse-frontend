/**
 * Servicios de EMERGENCIA de grupos externos (pedido del usuario, 21-09-2026).
 *
 * Cómo lo describió: «recibir alertas de grupos externos (Premium) — será un servicio que
 * brindaremos a los conductores para que puedan recibir servicios de emergencia de grupos que no
 * integran». Y al preguntarle los detalles eligió: **solo los servicios que el proveedor marque
 * como emergencia** (hay un botón para eso en Nuevo servicio) y **solo los que estén cerca de él**
 * (con su ubicación, como la distancia al origen que ya usa el inicio).
 *
 * Esta lib tiene la REGLA (pura, comprobable sin navegador) y la preferencia del conductor:
 *   - `esEmergenciaCercaDeMi` responde si un servicio entra en su lista.
 *   - `emergenciasCercanas` devuelve los ids que entran (es lo que la visibilidad del inicio usa
 *     para dejar pasar alertas de grupos a los que el conductor NO pertenece).
 *
 * El radio es un número puesto aquí a propósito: si hay que cambiarlo, se cambia en un solo sitio.
 */
import { ServiceAlert } from '../types';

/** A qué distancia máxima se considera «cerca» (kilómetros en línea recta, al origen del servicio). */
export const RADIO_DE_EMERGENCIAS_KM = 15;

/**
 * Cuántas emergencias se descargan como mucho para luego filtrar por distancia. Es un tope de
 * seguridad: si algún día hay muchas a la vez, la app no se trae un montón de filas.
 */
export const LIMITE_DE_EMERGENCIAS = 40;

export interface Punto {
  lat: number;
  lng: number;
}

const RADIO_DE_LA_TIERRA_KM = 6371;

/** Distancia en kilómetros entre dos puntos (línea recta, fórmula del haversine). */
export function distanciaEnKm(a: Punto, b: Punto): number {
  const aRadianes = (grados: number) => (grados * Math.PI) / 180;
  const dLat = aRadianes(b.lat - a.lat);
  const dLng = aRadianes(b.lng - a.lng);
  const lat1 = aRadianes(a.lat);
  const lat2 = aRadianes(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_DE_LA_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * ¿Este servicio es una emergencia que le toca ver a este conductor?
 *
 * Tiene que estar marcado como emergencia, seguir abierto (si ya lo tomaron, no), no estar
 * archivado, no ser suyo como proveedor, y su ORIGEN tiene que caer dentro del radio. Sin
 * ubicación no hay «cerca»: no se muestra nada (y la pantalla lo dice).
 */
export function esEmergenciaCercaDeMi(
  service: ServiceAlert,
  miUbicacion: Punto | null,
  radioKm: number = RADIO_DE_EMERGENCIAS_KM
): boolean {
  if (!miUbicacion) return false;
  if (service.emergencia !== true) return false;
  // Solo las que siguen abiertas: si ya tiene conductor, no es una oportunidad.
  if (service.status !== 'STATUS_OPEN') return false;
  if (service.archived) return false;
  if (typeof service.origin_lat !== 'number' || typeof service.origin_lng !== 'number')
    return false;
  if (service.origin_lat === 0 && service.origin_lng === 0) return false;
  return (
    distanciaEnKm(miUbicacion, { lat: service.origin_lat, lng: service.origin_lng }) <= radioKm
  );
}

/** Los ids de las emergencias que le tocan a este conductor (lo que la lista deja pasar). */
export function emergenciasCercanas(
  services: readonly ServiceAlert[],
  miUbicacion: Punto | null,
  radioKm: number = RADIO_DE_EMERGENCIAS_KM
): string[] {
  return services
    .filter((service) => esEmergenciaCercaDeMi(service, miUbicacion, radioKm))
    .map((service) => service.id);
}

/**
 * ¿El conductor pidió recibir emergencias cercanas?
 *
 * La marca vive en su PERFIL (`profiles.recibir_emergencias`), no solo en el teléfono: el aviso al
 * móvil lo manda el servidor, y el servidor no puede ver lo que hay guardado en el teléfono.
 * Por defecto NO: nadie recibe emergencias ajenas sin pedirlo.
 */
export function leerEmergenciasActivas(
  perfil:
    | {
        /** El perfil de las pantallas (`MockStoreContext.UserProfile`). */
        recibirEmergencias?: boolean;
        /** El perfil tal cual viene de la base (`profiles.recibir_emergencias`). */
        recibir_emergencias?: boolean | null;
      }
    | null
    | undefined
): boolean {
  return perfil?.recibirEmergencias === true || perfil?.recibir_emergencias === true;
}
