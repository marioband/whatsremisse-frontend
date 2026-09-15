import { useEffect, useMemo, useState } from 'react';

import { fetchPosicionesDePostulantes, PosicionDeConductor } from '../lib/database';
import { Coordenada, distanciaLinealMetros, MAXIMO_CANDIDATOS_ETA } from '../lib/geo';
import { registrarAhorro } from '../lib/medidor';
import { formatearEstimacion, hayApiDeRutas, medirRuta, Punto } from '../lib/routes';

/**
 * Tiempo y distancia de cada postulante hasta el punto de origen del servicio.
 *
 * Es la medida que el proveedor necesita para decidir a quién acepta (el formato
 * `(2 min 1.3 km)` de la tarjeta de postulante). Se calcula con las reglas de
 * ahorro del proyecto:
 *   1. La posición de cada postulante la publicó su propio dispositivo (una sola
 *      escritura cada 500 m o 5 minutos, ver `usePosicionPublicada`); aquí solo se
 *      lee, y solo si el proveedor es el dueño del servicio (lo decide la función
 *      `service_applicant_positions`).
 *   2. Con esas coordenadas se ordena por cercanía con nuestro propio cálculo
 *      (gratis) y solo se pide medida exacta a los `MAXIMO_CANDIDATOS_ETA` más
 *      cercanos; el resto no cuesta nada.
 *   3. Cada medida pasa por la caché (memoria + persistente): 5 minutos con la
 *      posición del postulante redondeada a 500 m.
 * Si un postulante no publicó ubicación reciente, simplemente no tiene texto.
 */
export interface ResultadoDePostulantes {
  /** driverId -> "(2 min 1.3 km)" */
  estimaciones: Record<string, string>;
  /** Cuántos postulantes publicaron una ubicación reciente. */
  conUbicacion: number;
  /** true mientras se consultan posiciones y medidas. */
  cargando: boolean;
}

const PAUSA_ENTRE_LLAMADAS_MS = 200;

export function useEstimacionesDePostulantes(
  serviceId: string | null,
  postulantes: string[],
  origen: Punto | null,
  habilitado: boolean
): ResultadoDePostulantes {
  const [estimaciones, setEstimaciones] = useState<Record<string, string>>({});
  const [conUbicacion, setConUbicacion] = useState(0);
  const [cargando, setCargando] = useState(false);

  const clave = useMemo(
    () => `${serviceId || ''}|${[...postulantes].sort().join(',')}`,
    [serviceId, postulantes]
  );

  const lat = origen?.lat ?? null;
  const lng = origen?.lng ?? null;
  const direccion = origen?.address ?? '';

  useEffect(() => {
    if (!habilitado || !serviceId || postulantes.length === 0) return;
    let vigente = true;
    setCargando(true);

    (async () => {
      let posiciones: Record<string, PosicionDeConductor> = {};
      try {
        posiciones = await fetchPosicionesDePostulantes(serviceId);
      } catch (err) {
        // Sin la migración 0009 aplicada esto viene vacío; cualquier otro fallo se
        // deja en consola y la tarjeta sigue mostrando el resto de los datos.
        // eslint-disable-next-line no-console
        console.warn('[postulantes] no se pudieron leer las posiciones:', err);
      }
      if (!vigente) return;

      const conPunto = postulantes
        .filter((id) => posiciones[id])
        .map((id) => ({
          id,
          punto: { lat: posiciones[id].lat, lng: posiciones[id].lng } as Coordenada,
        }));
      setConUbicacion(conPunto.length);

      if (!hayApiDeRutas() || conPunto.length === 0) {
        if (vigente) setCargando(false);
        return;
      }

      // Escalón gratis: los más cercanos al origen primero.
      const origenCoord: Coordenada | null =
        typeof lat === 'number' && typeof lng === 'number' && lat !== 0 ? { lat, lng } : null;

      let elegidos = conPunto;
      if (origenCoord) {
        elegidos = [...conPunto].sort(
          (a, b) =>
            distanciaLinealMetros(a.punto, origenCoord) -
            distanciaLinealMetros(b.punto, origenCoord)
        );
      }
      if (elegidos.length > MAXIMO_CANDIDATOS_ETA) {
        registrarAhorro('cercania', elegidos.length - MAXIMO_CANDIDATOS_ETA);
        elegidos = elegidos.slice(0, MAXIMO_CANDIDATOS_ETA);
      }

      const puntoOrigen: Punto = origen || { lat, lng, address: direccion };
      const nuevas: Record<string, string> = {};

      for (const candidato of elegidos) {
        if (!vigente) return;
        const texto = formatearEstimacion(await medirRuta(candidato.punto, puntoOrigen));
        if (texto) nuevas[candidato.id] = texto;
        await new Promise((resolver) => setTimeout(resolver, PAUSA_ENTRE_LLAMADAS_MS));
      }

      if (vigente) {
        setEstimaciones((actuales) => ({ ...actuales, ...nuevas }));
        setCargando(false);
      }
    })();

    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, habilitado, lat, lng, direccion]);

  return { estimaciones, conUbicacion, cargando };
}
