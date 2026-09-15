import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { elegirCandidatosPorCercania, MAXIMO_CANDIDATOS_ETA } from '../lib/geo';
import {
  explicacionDeUbicacion,
  obtenerUbicacion,
  olvidarUbicacion,
  ultimaUbicacion,
} from '../lib/geolocation';
import { registrarAhorro } from '../lib/medidor';
import { formatearEstimacion, hayApiDeRutas, medirRuta } from '../lib/routes';
import { ServiceAlert } from '../types';

/**
 * Distancia y tiempo de los servicios, para la alerta del conductor (Premium):
 *   - `origen`: del conductor al punto de origen (necesita la ubicación);
 *   - `destino`: del origen al destino del servicio (no necesita la ubicación).
 *
 * Reglas de ahorro que aplica este hook (antes de gastar una sola llamada):
 *   1. Nada si el conductor no es premium o no hay clave de Google.
 *   2. Filtro propio (haversine, gratis): se eligen solo los `MAXIMO_CANDIDATOS_ETA`
 *      servicios más cercanos; el resto se descarta sin consultar nada.
 *   3. Las medidas se reutilizan: la posición se redondea a bloques de 500 m y la
 *      caché persistente dura 5 minutos, así que moverse por la ciudad no genera
 *      una consulta por cada actualización de GPS. El tramo origen→destino (fijo
 *      para un servicio) se guarda 30 días.
 *
 * Si no hay ubicación (por ejemplo sirviendo la app por HTTP: el navegador la
 * bloquea), se devuelve `avisoDeUbicacion` con la explicación y el botón
 * "Reintentar" vuelve a intentarlo.
 */
export interface EstimacionesDeServicio {
  origen?: string;
  destino?: string;
}

export interface ResultadoEstimaciones {
  estimaciones: Record<string, EstimacionesDeServicio>;
  /** Explicación a mostrar cuando no se pudo obtener la ubicación. */
  avisoDeUbicacion: string | null;
  /** Vuelve a pedir la ubicación y a medir todo de nuevo. */
  reintentar: () => void;
}

const PAUSA_ENTRE_LLAMADAS_MS = 200;

export function useEstimacionesDeRuta(
  servicios: ServiceAlert[],
  habilitado: boolean
): ResultadoEstimaciones {
  const [estimaciones, setEstimaciones] = useState<Record<string, EstimacionesDeServicio>>({});
  const [avisoDeUbicacion, setAviso] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const yaPedidos = useRef<Set<string>>(new Set());

  // Identidad de lo que hay que medir: evita que un re-render dispare trabajo.
  const clave = useMemo(
    () => servicios.map((s) => `${s.id}|${s.origin_address}|${s.destination_address}`).join('~'),
    [servicios]
  );

  const reintentar = useCallback(() => {
    olvidarUbicacion();
    yaPedidos.current.clear();
    setIntento((actual) => actual + 1);
  }, []);

  useEffect(() => {
    if (!habilitado || servicios.length === 0 || !hayApiDeRutas()) return;
    let vigente = true;

    (async () => {
      // La ubicación se pide una sola vez por pantalla (y solo si hace falta).
      const ubicacion = ultimaUbicacion() || (await obtenerUbicacion());
      const posicion = ubicacion ? { lat: ubicacion.lat, lng: ubicacion.lng } : null;
      if (!vigente) return;
      // Sin ubicación se avisa (y se sigue midiendo origen→destino, que no la
      // necesita: así la alerta nunca queda vacía).
      setAviso(posicion ? null : explicacionDeUbicacion());

      // Escalón gratis: coordenadas propias + distancia en línea recta.
      const entradas = servicios.map((servicio) => ({
        servicio,
        origen:
          typeof servicio.origin_lat === 'number' &&
          typeof servicio.origin_lng === 'number' &&
          servicio.origin_lat !== 0
            ? { lat: servicio.origin_lat, lng: servicio.origin_lng }
            : null,
      }));

      const { candidatos, descartados } = elegirCandidatosPorCercania(posicion, entradas);
      if (descartados.length > 0) registrarAhorro('cercania', descartados.length);

      const nuevas: Record<string, EstimacionesDeServicio> = {};

      for (const { servicio } of candidatos) {
        if (!vigente) return;
        const marca = `${servicio.id}|${servicio.origin_address}|${servicio.destination_address}`;
        if (yaPedidos.current.has(marca)) continue;
        yaPedidos.current.add(marca);

        const puntoOrigen = {
          address: servicio.origin_address,
          lat: servicio.origin_lat || null,
          lng: servicio.origin_lng || null,
        };
        const puntoDestino = {
          address: servicio.destination_address,
          lat: servicio.destination_lat || null,
          lng: servicio.destination_lng || null,
        };

        const haciaDestino = formatearEstimacion(await medirRuta(puntoOrigen, puntoDestino));
        const haciaOrigen = posicion
          ? formatearEstimacion(await medirRuta(posicion, puntoOrigen))
          : '';

        if (!vigente) return;
        if (haciaDestino || haciaOrigen) {
          nuevas[servicio.id] = {
            origen: haciaOrigen || undefined,
            destino: haciaDestino || undefined,
          };
        }
        await new Promise((resolver) => setTimeout(resolver, PAUSA_ENTRE_LLAMADAS_MS));
      }

      if (vigente && Object.keys(nuevas).length > 0) {
        setEstimaciones((actuales) => ({ ...actuales, ...nuevas }));
      }
    })();

    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, habilitado, intento]);

  return { estimaciones, avisoDeUbicacion, reintentar };
}

/** Cuántos servicios como máximo se miden por pantalla (se exporta para probarlo). */
export const MAXIMO_SERVICIOS_MEDIDOS = MAXIMO_CANDIDATOS_ETA;
