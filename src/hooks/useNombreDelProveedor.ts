import { useEffect, useMemo, useState } from 'react';

import { nombreParaMostrar } from '../lib/nombreDelProveedor';
import { nombreDelProveedorEnCache, resolverNombreDelProveedor } from '../lib/proveedorDeLaTarjeta';
import { ServiceAlert } from '../types';

/**
 * El nombre del proveedor de UNA tarjeta de servicio.
 *
 * Si la fila ya lo trae (`company_name`/`provider_name`, que es el caso de los
 * servicios recién creados en este dispositivo) se usa ese; si no —las filas que
 * vienen de la base, que no tienen columnas de nombre— se resuelve desde el perfil
 * del proveedor (`public_profile`, 0005) con la caché de `lib/proveedorDeLaTarjeta`.
 *
 * El estado arranca con lo que ya esté en la caché de la sesión: así, si la tarjeta se
 * vuelve a montar (el chat se re-renderiza cada 6 s), el nombre correcto se pinta en el
 * primer fotograma y la tarjeta no parpadea entre "Proveedor" y el nombre real.
 */
export function useNombreDelProveedor(service?: Partial<ServiceAlert> | null): string {
  const providerId = service?.provider_id ?? '';
  const deLaFila = service?.company_name || service?.provider_name || '';
  const serviceId = service?.id ?? '';

  const [nombreResuelto, setNombreResuelto] = useState(() => nombreDelProveedorEnCache(providerId));

  useEffect(() => {
    if (deLaFila || !providerId) return;
    let vigente = true;
    resolverNombreDelProveedor(providerId).then((nombre) => {
      if (vigente && nombre) setNombreResuelto(nombre);
    });
    return () => {
      vigente = false;
    };
  }, [serviceId, providerId, deLaFila]);

  return nombreParaMostrar(service, nombreResuelto);
}

/**
 * Los nombres de los proveedores de una LISTA (para pantallas que pintan filas con
 * una función y no pueden usar un hook por tarjeta).
 *
 * Devuelve un mapa `provider_id → nombre` con los que ya se conocen, y va
 * completándolo cuando responde la base.
 */
export function useNombresDeProveedores(services: Partial<ServiceAlert>[]): Record<string, string> {
  const ids = useMemo(
    () =>
      Array.from(new Set(services.map((s) => s.provider_id).filter((id): id is string => !!id))),
    [services]
  );
  const clave = ids.join(',');

  const [nombres, setNombres] = useState<Record<string, string>>({});

  useEffect(() => {
    if (ids.length === 0) return;
    let vigente = true;
    Promise.all(ids.map(async (id) => [id, await resolverNombreDelProveedor(id)] as const)).then(
      (pares) => {
        if (!vigente) return;
        const conNombre = pares.filter(([, nombre]) => !!nombre);
        if (conNombre.length === 0) return;
        setNombres((antes) => ({ ...antes, ...Object.fromEntries(conNombre) }));
      }
    );
    return () => {
      vigente = false;
    };
    // `clave` resume los ids: el efecto no debe correr en cada render de la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  return nombres;
}
