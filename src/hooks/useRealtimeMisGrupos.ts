/**
 * Mis grupos EN VIVO (pedido del usuario, 20-09-2026).
 *
 * LO QUE PASABA: el globo del contador y el orden de los grupos solo se actualizaban al **salir y
 * volver** a la pantalla (`useFocusEffect`), así que un mensaje que llegaba con «Mis grupos»
 * abierto no movía nada: solo sonaba el aviso del teléfono. El usuario lo dijo así: «ya no están
 * reaccionando en vivo con los mensajes… cuando salgo del apartado y regreso, recién se actualiza».
 *
 * QUÉ HACE: se suscribe a los mensajes NUEVOS de los grupos del usuario y avisa a la pantalla para
 * que relea el contador (`grupos_sin_leer`) y el último mensaje de cada grupo
 * (`grupos_ultimo_mensaje`). Con eso el globo aparece solo y el grupo que acaba de recibir un
 * mensaje **sube de sitio deslizándose** (el efecto ya lo pone la lista).
 *
 * Detalles que importan:
 *   - Los mensajes PROPIOS no cuentan (igual que el contador de la base): escribir tú no mueve el
 *     grupo ni suma al globo.
 *   - La suscripción escucha los mensajes que el RLS deja ver a este usuario (sus grupos) y
     descarta en el cliente cualquier otro.
 *   - En nativo el canal se levanta igual; en web es donde más se nota (la pestaña se congela al
 *     salir, y por eso el respaldo periódico no bastaba).
 */
import { useEffect, useRef } from 'react';

import { mensajeCuentaParaActualizar } from '../lib/misGruposEnVivo';
import { supabase } from '../lib/supabase';

export function useRealtimeMisGrupos(
  idsDeMisGrupos: readonly string[],
  miId: string | null | undefined,
  alLlegarMensaje: () => void
): void {
  /** El callback en un ref: cambia en cada render y no debe volver a suscribirse por eso. */
  const avisoRef = useRef(alLlegarMensaje);
  useEffect(() => {
    avisoRef.current = alLlegarMensaje;
  }, [alLlegarMensaje]);

  const clave = idsDeMisGrupos.join('|');

  useEffect(() => {
    if (!miId || !clave) return;

    const grupos = clave.split('|');
    const soloLosMios = new Set(grupos);

    const canal = supabase
      .channel(`mis-grupos-${miId}`)
      .on(
        'postgres_changes',
        // Sin filtro de servidor (ver `lib/misGruposEnVivo`): el RLS ya limita a mis grupos y
        // la regla descarta aquí lo que no sea mío.
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          // La decisión (¿es mío? ¿es de un grupo mío?) vive en `lib/misGruposEnVivo`, probada.
          if (!mensajeCuentaParaActualizar(payload.new as never, miId, soloLosMios)) return;
          avisoRef.current();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [miId, clave]);
}
