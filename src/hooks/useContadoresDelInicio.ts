import { useMemo } from 'react';

import { useAuth } from '../context/AuthContext';
import { useMockStore } from '../context/MockStoreContext';
import { useEmergenciasCerca } from './useEmergenciasCerca';
import { useUnidadesExtra } from './useUnidadesExtra';
import {
  estaEnProcesoDelConductor,
  estaEnProcesoDelProveedor,
  listaDelProveedor,
} from '../lib/apartadosDelInicio';
import { listaBaseDelConductor, serviciosDelInicio } from '../lib/listaDelConductor';
import { sumaDeNumeros } from '../lib/numerosDelInicio';
import { tiposEfectivos } from '../lib/unidades';

/**
 * Los números de los botones (Conductor / Proveedor / Mis grupos) y de sus sub botones
 * (Disponibles, En proceso, Publicados).
 *
 * Se calculan AQUÍ y no dentro de cada inicio porque la cabecera los enseña siempre —también
 * cuando el usuario está en otro apartado—, así que tienen que salir de los datos del almacén, que
 * está siempre cargado. Y salen de las MISMAS funciones que arman las listas
 * (`listaBaseDelConductor`, `serviciosDelInicio`, `listaDelProveedor`, `estaEnProceso…`): el número
 * de un apartado no puede contradecir lo que se ve al entrar en él.
 *
 * QUÉ SON LOS NÚMEROS (cambio del 23-09-2026, pedido textual del usuario):
 *
 *   - Conductor, Proveedor y sus sub botones (Disponibles, En proceso, Publicados) cuentan las
 *     **tarjetas activas que hay en ese momento**. No son «novedades sin ver»: entrar al apartado
 *     NO baja el número (el usuario las puede haber visto, pero las tarjetas siguen ahí) y solo baja
 *     cuando una tarjeta desaparece de la lista — por ejemplo, cuando otro conductor la cubre o el
 *     servicio se cierra—. Con 100 disponibles, entrar deja 100; si una se cubre, queda 99.
 *   - Mis grupos NO cambia: es la SUMA de los mensajes sin leer de todos los grupos, y al abrir el
 *     grupo pasa a cero (así lo fijó el usuario el 20-09-2026 y lo confirmó el 23-09-2026).
 *
 * Por eso aquí ya no hay marcas de «ya lo miré»: el número es la cuenta de la lista, ni más ni menos.
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

export function useContadoresDelInicio(): { contadores: ContadoresDelInicio } {
  const { services, applications, groups, userProfile, sinLeerDeGrupos } = useMockStore();
  const { session } = useAuth();
  const userId = session?.user?.id ?? '';
  // Las mismas unidades que ve el inicio (las suyas + las que marcó en el filtro): si aquí no se
  // contaran, el número del botón contradiría la lista.
  const [unidadesExtra] = useUnidadesExtra();
  // La MISMA lista que usa el inicio: si aquí no entraran, el botón «Disponibles» no contaría las
  // emergencias que el conductor sí ve en la lista.
  const emergenciasCerca = useEmergenciasCerca();

  const contadores = useMemo<ContadoresDelInicio>(() => {
    if (!userId) return SIN_CONTADORES;

    // Mismas reglas que los inicios (lib/listaDelConductor). Lo único que NO entra son los estados
    // transitorios de la pantalla —el rechazo recién llegado de 3 segundos y el toque local de
    // inicio—: no son tarjetas de la lista.
    const opciones = {
      userId,
      groupIds: groups.map((g) => g.id),
      tiposDeVehiculo: tiposEfectivos(userProfile?.vehicleTypes ?? [], unidadesExtra),
      emergenciasCerca,
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

    // Las TARJETAS de cada apartado, contadas tal cual: si una desaparece de la lista, el número
    // baja solo (no hay marcas ni «visto» que apaguen nada).
    const disponibles = disponiblesLista.length;
    const enProcesoConductor = enProcesoLista.length;
    const publicados = publicadosLista.length;
    const enProcesoProveedor = enProcesoDelProveedorLista.length;

    // Mis grupos sí es «sin leer»: al abrir el grupo, su globo y este número bajan.
    const misGrupos = Object.values(sinLeerDeGrupos).reduce(
      (total, numero) => total + (Number.isFinite(numero) ? numero : 0),
      0
    );

    return {
      disponibles,
      enProcesoConductor,
      publicados,
      enProcesoProveedor,
      conductor: sumaDeNumeros(disponibles, enProcesoConductor),
      proveedor: sumaDeNumeros(publicados, enProcesoProveedor),
      misGrupos,
    };
  }, [
    applications,
    groups,
    services,
    sinLeerDeGrupos,
    unidadesExtra,
    emergenciasCerca,
    userProfile,
    userId,
  ]);

  return { contadores };
}
