import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../context/AuthContext';
import { useMockStore } from '../context/MockStoreContext';
import {
  estaEnProcesoDelConductor,
  estaEnProcesoDelProveedor,
  listaDelProveedor,
} from '../lib/apartadosDelInicio';
import { claveDeSinLeer } from '../lib/database';
import { listaBaseDelConductor, serviciosDelInicio } from '../lib/listaDelConductor';
import {
  APARTADOS_DEL_INICIO,
  ApartadoDelInicio,
  contarNovedades,
  hayNovedadDesde,
  leerApartadoVisto,
  marcarApartadoVisto,
  sumaDeNovedades,
} from '../lib/novedadesDelInicio';

/**
 * Los números de los botones (Conductor / Proveedor / Mis grupos) y de sus sub botones
 * (Disponibles, En proceso, Publicados). Pedido del usuario, 20-09-2026.
 *
 * Se calculan AQUÍ y no dentro de cada inicio porque la cabecera los enseña siempre —también
 * cuando el usuario está en otro apartado—, así que tienen que salir de los datos del almacén, que
 * está siempre cargado. Y salen de las MISMAS funciones que arman las listas
 * (`listaBaseDelConductor`, `serviciosDelInicio`, `listaDelProveedor`, `estaEnProceso…`): el número
 * de un apartado no puede contradecir lo que se ve al entrar en él.
 *
 * Cada número son NOVEDADES SIN VER (lo eligió el usuario): lo que llegó después de la última vez
 * que tocó ese botón. Al tocar un sub botón, su marca pasa a «ahora» y el número baja —y con él el
 * del botón de arriba, que es la suma—.
 */
export interface ContadoresDelInicio {
  /** Botones de arriba: la suma de sus dos apartados. */
  conductor: number;
  proveedor: number;
  /** Mis grupos: la suma de los mensajes sin leer de TODOS los grupos (`grupos_sin_leer`). */
  misGrupos: number;
  /** Sub botones del inicio del conductor. */
  disponibles: number;
  enProcesoConductor: number;
  /** Sub botones del inicio del proveedor. */
  publicados: number;
  enProcesoProveedor: number;
}

const SIN_CONTADORES: ContadoresDelInicio = {
  conductor: 0,
  proveedor: 0,
  misGrupos: 0,
  disponibles: 0,
  enProcesoConductor: 0,
  publicados: 0,
  enProcesoProveedor: 0,
};

export function useContadoresDelInicio(): {
  contadores: ContadoresDelInicio;
  marcarVisto: (apartado: ApartadoDelInicio) => void;
} {
  const { services, applications, groups, userProfile, sinLeerDeGrupos, sinLeerDeServicios } =
    useMockStore();
  const { session } = useAuth();
  const userId = session?.user?.id ?? '';

  /** Las marcas de «ya lo miré» viven en el dispositivo, por cuenta y apartado. */
  const [marcas, setMarcas] = useState<Partial<Record<ApartadoDelInicio, Date | null>>>({});

  useEffect(() => {
    if (!userId) {
      setMarcas({});
      return;
    }
    let vigente = true;
    (async () => {
      const leidas: Partial<Record<ApartadoDelInicio, Date | null>> = {};
      for (const apartado of APARTADOS_DEL_INICIO) {
        leidas[apartado] = await leerApartadoVisto(apartado, userId);
      }
      if (vigente) setMarcas(leidas);
    })();
    return () => {
      vigente = false;
    };
  }, [userId]);

  /** El usuario toca el botón de un apartado: lo que hay ahora ya es «lo que miré». */
  const marcarVisto = useCallback(
    (apartado: ApartadoDelInicio) => {
      setMarcas((actuales) => ({ ...actuales, [apartado]: new Date() }));
      void marcarApartadoVisto(apartado, userId);
    },
    [userId]
  );

  const contadores = useMemo<ContadoresDelInicio>(() => {
    if (!userId) return SIN_CONTADORES;

    // Mismas reglas que los inicios (lib/listaDelConductor). Lo único que NO entra son los estados
    // transitorios de la pantalla —el rechazo recién llegado de 3 segundos y el toque local de
    // inicio—: no son novedades que el usuario tenga que ir a ver.
    const opciones = {
      userId,
      groupIds: groups.map((g) => g.id),
      tiposDeVehiculo: userProfile?.vehicleTypes ?? [],
      mostrarArchivados: false,
      rechazoReciente: () => false,
      inicioCumplido: () => false,
    };

    const baseDelConductor = listaBaseDelConductor(services, applications, opciones);
    const disponiblesLista = serviciosDelInicio(
      baseDelConductor,
      applications,
      'Disponibles',
      opciones
    );
    const enProcesoLista = baseDelConductor.filter((s) =>
      estaEnProcesoDelConductor(s, userId, false)
    );

    const mios = listaDelProveedor(services.filter((s) => s.provider_id === userId));
    const publicadosLista = mios.filter((s) => !estaEnProcesoDelProveedor(s));
    const enProcesoDelProveedorLista = mios.filter((s) => estaEnProcesoDelProveedor(s));

    /** Mensajes sin leer de la conversación de ese servicio con ese conductor. */
    const sinLeerDe = (serviceId: string, driverId: string | null | undefined): number =>
      sinLeerDeServicios[claveDeSinLeer(serviceId, driverId || '')] ?? 0;

    /** Todos los mensajes sin leer de un servicio (el proveedor tiene una conversación por conductor). */
    const sinLeerDelServicio = (serviceId: string): number =>
      Object.entries(sinLeerDeServicios).reduce(
        (total, [clave, numero]) => (clave.startsWith(`${serviceId}|`) ? total + numero : total),
        0
      );

    const disponibles = contarNovedades(
      disponiblesLista.map((s) => s.created_at),
      marcas.disponibles ?? null
    );

    // «En proceso» son novedades de SUS conversaciones: mensajes sin leer, o la fila del servicio
    // que cambió (avance del viaje, pago, aceptación) desde la última visita al apartado.
    const enProcesoConductor = enProcesoLista.filter(
      (s) =>
        sinLeerDe(s.id, userId) > 0 ||
        hayNovedadDesde(s.updated_at || s.created_at, marcas['en-proceso-conductor'] ?? null)
    ).length;

    const enProcesoProveedor = enProcesoDelProveedorLista.filter(
      (s) =>
        sinLeerDelServicio(s.id) > 0 ||
        hayNovedadDesde(s.updated_at || s.created_at, marcas['en-proceso-proveedor'] ?? null)
    ).length;

    // «Publicados»: los servicios publicados que recibieron POSTULACIONES nuevas desde su visita.
    const publicados = publicadosLista.filter((s) =>
      applications.some(
        (a) =>
          a.serviceId === s.id &&
          a.status === 'PENDING' &&
          hayNovedadDesde(a.createdAt, marcas.publicados ?? null)
      )
    ).length;

    const misGrupos = Object.values(sinLeerDeGrupos).reduce(
      (total, numero) => total + (Number.isFinite(numero) ? numero : 0),
      0
    );

    return {
      disponibles,
      enProcesoConductor,
      publicados,
      enProcesoProveedor,
      conductor: sumaDeNovedades(disponibles, enProcesoConductor),
      proveedor: sumaDeNovedades(publicados, enProcesoProveedor),
      misGrupos,
    };
  }, [
    applications,
    groups,
    marcas,
    services,
    sinLeerDeGrupos,
    sinLeerDeServicios,
    userProfile,
    userId,
  ]);

  return { contadores, marcarVisto };
}
