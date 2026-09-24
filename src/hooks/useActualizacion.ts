import { useCallback, useEffect, useRef, useState } from 'react';

import {
  hayVersionNueva,
  leerVersionDelSitio,
  recargarConLaVersionNueva,
  VersionDelSitio,
  VersionEnEjecucion,
  versionEnEjecucion,
} from '../lib/actualizacion';

/** Cada cuánto se mira si hay versión nueva mientras la app está en primer plano. */
const CADA_MS = 2 * 60 * 1000;

export interface EstadoDeActualizacion {
  /** La versión que está corriendo (null: sin sello, p. ej. build nativo). */
  versionActual: VersionEnEjecucion | null;
  /** La que hay en el servidor, cuando es distinta de la mía. */
  versionNueva: VersionDelSitio | null;
  /** Hay que BLOQUEAR la app (al abrir o reanudar, o si la nueva está marcada como urgente). */
  bloqueo: boolean;
  /** La banda de aviso (mientras usa la app; se puede ocultar hasta la próxima reanudación). */
  banda: boolean;
  ocultarBanda: () => void;
  actualizar: () => void;
}

/**
 * Vigila si hay una versión nueva desplegada (24-09-2026).
 *
 * CUÁNDO MIRA (y por qué cada momento):
 *   - Al ABRIR la app y cada vez que vuelve a primer plano (`visibilitychange`): en iPhone, salir y
 *     volver suele DESCONGELAR la pestaña sin recargarla, así que si no se mira al volver, el
 *     usuario no se enteraría de la actualización en todo el día.
 *   - Cada 2 minutos mientras está en primer plano: si se despliega mientras la usa, sale la banda.
 *
 * QUÉ HACE CON LO QUE ENCUENTRA (decisión del usuario):
 *   - Al abrir o reanudar: BLOQUEA. No se trabaja con la versión vieja.
 *   - Mientras la usa: banda de aviso, para que actualice cuando pare.
 *   - Si el despliegue está marcado como URGENTE: bloquea al instante, también en medio del uso.
 */
export function useActualizacion(): EstadoDeActualizacion {
  const [versionActual] = useState<VersionEnEjecucion | null>(() => versionEnEjecucion());
  const [versionNueva, setVersionNueva] = useState<VersionDelSitio | null>(null);
  const [bloqueo, setBloqueo] = useState(false);
  const [banda, setBanda] = useState(false);
  /** Si ya se bloqueó, no se vuelve a evaluar: el bloqueo solo se levanta actualizando. */
  const yaBloqueado = useRef(false);

  const revisar = useCallback(
    async (alAbrirOReanudar: boolean) => {
      if (yaBloqueado.current) return;
      const suya = await leerVersionDelSitio();
      const mia = versionEnEjecucion() ?? versionActual;
      if (!hayVersionNueva(mia, suya) || !suya) {
        return;
      }
      setVersionNueva(suya);
      if (alAbrirOReanudar || suya.urgente === true) {
        yaBloqueado.current = true;
        setBloqueo(true);
        return;
      }
      setBanda(true);
    },
    [versionActual]
  );

  useEffect(() => {
    void revisar(true);
    if (typeof document === 'undefined') return;

    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible') {
        // Al volver a la app se deja de ocultar la banda: la comprobación vuelve a decidir.
        setBanda(false);
        void revisar(true);
      }
    };
    const temporizador = setInterval(() => {
      if (document.visibilityState === 'visible') void revisar(false);
    }, CADA_MS);

    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    return () => {
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      clearInterval(temporizador);
    };
  }, [revisar]);

  const actualizar = useCallback(() => {
    recargarConLaVersionNueva(versionNueva?.version ?? '');
  }, [versionNueva]);

  return {
    versionActual,
    versionNueva,
    bloqueo,
    banda,
    ocultarBanda: () => setBanda(false),
    actualizar,
  };
}
