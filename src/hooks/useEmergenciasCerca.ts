import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMockStore } from '../context/MockStoreContext';
import { emergenciasCercanas, leerEmergenciasActivas } from '../lib/emergencias';
import { ultimaUbicacion } from '../lib/geolocation';
import { esPremium } from '../lib/premium';

/**
 * Los ids de las EMERGENCIAS que le tocan a este conductor ahora mismo (0041/0042).
 *
 * Es la misma respuesta para la lista del inicio y para los contadores: se calcula con la regla de
 * `lib/emergencias.ts` (premium + lo pidió + a menos de 15 km de su ubicación).
 *
 * Sin ubicación no hay «cerca»: devuelve una lista vacía (la pantalla del filtro lo explica).
 */
export function useEmergenciasCerca(): readonly string[] {
  const { profile } = useAuth();
  const { services, userProfile } = useMockStore();
  // La marca se lee del perfil de la base; el del teléfono sirve para responder enseguida, justo
  // después de activarla (hasta que el perfil de la base vuelva a leerse).
  const activas =
    esPremium(profile) &&
    (leerEmergenciasActivas(profile) || userProfile?.recibirEmergencias === true);

  return useMemo(
    () => (activas ? emergenciasCercanas(services, ultimaUbicacion()) : []),
    [activas, services]
  );
}
