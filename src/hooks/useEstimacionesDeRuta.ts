import { useEffect, useMemo, useRef, useState } from 'react';

import { obtenerUbicacion, ultimaUbicacion } from '../lib/geolocation';
import { formatearEstimacion, hayApiDeRutas, medirRuta } from '../lib/routes';
import { ServiceAlert } from '../types';

/**
 * Distancia y tiempo de los servicios, para la alerta del conductor (Premium):
 *   - `origen`: del conductor al punto de origen;
 *   - `destino`: del origen al destino del servicio.
 *
 * Se pide solo para los primeros servicios de la lista (`MAXIMO_POR_PANTALLA`),
 * porque cada medida es una llamada facturable a Routes API; el resultado se
 * guarda en memoria (también en `lib/routes.ts`) y no se repite.
 *
 * Si no hay premium, no hay clave de Google o el navegador no da la ubicación,
 * devuelve un objeto vacío y la tarjeta simplemente no muestra las medidas.
 */
export interface EstimacionesDeServicio {
  origen?: string;
  destino?: string;
}

const MAXIMO_POR_PANTALLA = 6;
const PAUSA_ENTRE_LLAMADAS_MS = 200;

export function useEstimacionesDeRuta(
  servicios: ServiceAlert[],
  habilitado: boolean
): Record<string, EstimacionesDeServicio> {
  const [estimaciones, setEstimaciones] = useState<Record<string, EstimacionesDeServicio>>({});
  const yaPedidos = useRef<Set<string>>(new Set());

  const objetivos = useMemo(
    () =>
      servicios
        .filter((s) => Boolean(s.origin_address && s.destination_address))
        .slice(0, MAXIMO_POR_PANTALLA),
    [servicios]
  );

  // Identidad de lo que hay que medir: evita volver a pedir en cada render.
  const clave = useMemo(
    () => objetivos.map((s) => `${s.id}|${s.origin_address}|${s.destination_address}`).join('~'),
    [objetivos]
  );

  useEffect(() => {
    if (!habilitado || objetivos.length === 0 || !hayApiDeRutas()) return;
    let vigente = true;

    (async () => {
      // La ubicación se pide una sola vez por pantalla (y solo si hace falta).
      const ubicacion = ultimaUbicacion() || (await obtenerUbicacion());
      const nuevas: Record<string, EstimacionesDeServicio> = {};

      for (const servicio of objetivos) {
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
        const haciaOrigen = ubicacion
          ? formatearEstimacion(
              await medirRuta({ lat: ubicacion.lat, lng: ubicacion.lng }, puntoOrigen)
            )
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
  }, [clave, habilitado]);

  return estimaciones;
}
