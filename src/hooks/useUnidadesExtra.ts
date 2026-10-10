import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { useAuth } from '../context/AuthContext';
import { guardarUnidadesExtraEnPerfil } from '../lib/database';
import {
  guardarUnidadesExtra,
  leerUnidadesExtraCrudo,
  normalizarUnidades,
} from '../lib/unidades';

/**
 * Las unidades que el conductor marcó en «Recibir también alertas de unidades» (filtro del inicio,
 * 21-09-2026). Vive en el dispositivo, como las demás preferencias del inicio — y desde el
 * 10-10-2026 también se guarda en el perfil (`profiles.unidades_extra`, 0056): el aviso del
 * servidor tiene que usar la MISMA regla para no avisar de más (ni de menos).
 *
 * Se relee al volver a la pantalla (por eso al salir del filtro la lista del inicio ya sale
 * actualizada) y devuelve también el guardado, que actualiza el estado en el acto. En un
 * teléfono nuevo (sin nada guardado aquí) se usa lo del perfil.
 */
export function useUnidadesExtra(): [string[], (nuevas: readonly string[]) => Promise<void>] {
  const { profile } = useAuth();
  const [extra, setExtra] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      let vigente = true;
      leerUnidadesExtraCrudo()
        .then((delTelefono) => {
          if (!vigente) return;
          if (delTelefono) {
            setExtra(delTelefono);
            return;
          }
          // Sin preferencia en ESTE teléfono (nunca se guardó aquí): la del perfil, que es la
          // misma que lee el aviso del servidor (0056). Guardado vacío SÍ se respeta.
          setExtra(normalizarUnidades(profile?.unidades_extra ?? []));
        })
        .catch(() => undefined);
      return () => {
        vigente = false;
      };
    }, [profile])
  );

  const guardar = useCallback(async (nuevas: readonly string[]) => {
    setExtra([...nuevas]);
    await guardarUnidadesExtra(nuevas);
    // 0056: el aviso del servidor necesita el mismo dato. Mejor esfuerzo: si falla, el filtro
    // del teléfono ya quedó guardado y la lista de la app funciona igual.
    try {
      await guardarUnidadesExtraEnPerfil(nuevas);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[UnidadesExtra] no se pudo guardar en el perfil:', err);
    }
  }, []);

  return [extra, guardar];
}
