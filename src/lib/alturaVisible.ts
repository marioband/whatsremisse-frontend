/**
 * Cuánto se ve de verdad de la app, y si el teclado está abierto.
 *
 * Por qué existe (18-09-2026, del usuario desde su iPhone: "entre la barra para textear y el
 * teclado del iPhone se generan espacios en blanco"): en iOS Safari el teclado NO encoge la
 * página: se dibuja ENCIMA y el navegador desplaza el documento para que el campo se vea.
 * Como la app medía el 100 % del viewport de maquetación (más alto que lo visible), quedaba
 * una franja entre la barra de escribir y el teclado, y la cabecera del chat se escapaba
 * hacia arriba al desplazarse la página.
 *
 * Solución: la altura visible se lee de `window.visualViewport` y se publica en la variable
 * CSS `--altura-visible`, que usan `html`, `body` y `#root`: la app se encoge con el teclado
 * y la barra de escribir queda pegada a él, sin que la página se desplace.
 *
 * Detalles que importan:
 *   - La variable se pone SIEMPRE (no solo con el teclado): así el fondo de la app queda por
 *     encima de la barra de Safari, que en el iPhone la tapaba.
 *   - El teclado se detecta porque el viewport visible encoge MUCHO más que esa barra
 *     (`UMBRAL_TECLADO_PX`); la referencia es la altura máxima vista (se actualiza al girar
 *     el teléfono, para no confundir un giro con un teclado).
 *   - En Android y en escritorio el navegador ya encoge la ventana, así que esto no cambia
 *     nada; en nativo el aviso lo da el propio sistema (`Keyboard`).
 */
import { Platform, Keyboard, KeyboardEvent } from 'react-native';

/** Variable CSS con la altura visible (vacía = usar el 100 % de siempre). */
export const ALTURA_VISIBLE = '--altura-visible';

/** Cuánto tiene que encoger el viewport para considerarlo el teclado (la barra de Safari ~60). */
export const UMBRAL_TECLADO_PX = 120;

export interface EstadoDeAltura {
  /** Alto visible ahora mismo, en píxeles. */
  alto: number;
  /** El alto visible más grande visto (referencia para detectar el teclado). */
  base: number;
  /** ¿El teclado tapa parte de la pantalla? */
  teclado: boolean;
}

let estado: EstadoDeAltura = { alto: 0, base: 0, teclado: false };
const oyentes = new Set<(e: EstadoDeAltura) => void>();

export function estadoDeAlturaVisible(): EstadoDeAltura {
  return estado;
}

export function suscribirAlturaVisible(oyente: (e: EstadoDeAltura) => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

function publicar(siguiente: EstadoDeAltura) {
  const cambio =
    siguiente.alto !== estado.alto ||
    siguiente.teclado !== estado.teclado ||
    siguiente.base !== estado.base;
  estado = siguiente;
  if (cambio) oyentes.forEach((o) => o(siguiente));
}

/**
 * Deja la medición andando. Devuelve la función para desinstalarla (la usa `App`).
 * Se puede llamar más de una vez sin duplicar nada: el estado es del módulo.
 */
export function instalarAlturaVisible(): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    // Nativo: el sistema ya encoge la ventana; solo hay que saber si el teclado está abierto.
    const mostrar = Keyboard.addListener('keyboardDidShow', (_e: KeyboardEvent) =>
      publicar({ ...estado, teclado: true })
    );
    const ocultar = Keyboard.addListener('keyboardDidHide', () =>
      publicar({ ...estado, teclado: false })
    );
    return () => {
      mostrar.remove();
      ocultar.remove();
    };
  }

  const vv = window.visualViewport;
  if (!vv) return () => {};

  const raiz = document.documentElement;

  const medir = () => {
    const alto = Math.round(vv.height);
    const base = Math.max(estado.base, alto);
    const teclado = base - alto > UMBRAL_TECLADO_PX;
    publicar({ alto, base, teclado });
    // La altura de la app es SIEMPRE lo que se ve de verdad. En iOS hace falta incluso sin
    // teclado: el 100 % es el viewport de maquetación (el de las barras plegadas), así que sin
    // esto el fondo de la app —y la barra de escribir— quedan detrás de la barra de Safari.
    // En Android y en escritorio coincide con la ventana y no cambia nada.
    raiz.style.setProperty(ALTURA_VISIBLE, `${alto}px`);
    if (teclado) {
      // Safari desplaza el documento al enfocar el campo; con la app ya ajustada, sobra.
      window.scrollTo(0, 0);
    }
  };

  medir();
  vv.addEventListener('resize', medir);
  vv.addEventListener('scroll', medir);
  window.addEventListener('orientationchange', medir);
  return () => {
    vv.removeEventListener('resize', medir);
    vv.removeEventListener('scroll', medir);
    window.removeEventListener('orientationchange', medir);
    raiz.style.removeProperty(ALTURA_VISIBLE);
  };
}
