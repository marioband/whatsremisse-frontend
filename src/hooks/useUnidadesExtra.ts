import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { guardarUnidadesExtra, leerUnidadesExtra } from '../lib/unidades';

/**
 * Las unidades que el conductor marcó en «Recibir también alertas de unidades» (filtro del inicio,
 * 21-09-2026). Vive en el dispositivo, como las demás preferencias del inicio.
 *
 * Se relee al volver a la pantalla (por eso al salir del filtro la lista del inicio ya sale
 * actualizada) y devuelve también el guardado, que actualiza el estado en el acto.
 */
export function useUnidadesExtra(): [string[], (nuevas: readonly string[]) => Promise<void>] {
  const [extra, setExtra] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      let vigente = true;
      leerUnidadesExtra()
        .then((unidades) => {
          if (vigente) setExtra(unidades);
        })
        .catch(() => undefined);
      return () => {
        vigente = false;
      };
    }, [])
  );

  const guardar = useCallback(async (nuevas: readonly string[]) => {
    setExtra([...nuevas]);
    await guardarUnidadesExtra(nuevas);
  }, []);

  return [extra, guardar];
}
