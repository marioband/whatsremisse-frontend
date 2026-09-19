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

/**
 * Un cambio de alto MENOR que esto no se aplica: son los temblores de 1-2 px que el navegador
 * reporta mientras el teclado se mueve (y que antes movían la app entera a saltos).
 */
export const UMBRAL_CAMBIO_PX = 40;

/**
 * Cuánto se espera para volver a aplicar el alto después del último evento.
 *
 * Es solo la corrección final (el valor definitivo): el ajuste que se ve mientras el teclado
 * se anima se aplica al instante, para no darle tiempo al navegador a desplazar la página.
 */
export const RETARDO_DE_ASENTAMIENTO_MS = 140;

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
  /** El último alto que se aplicó de verdad (para no reaplicar cambios de 1-2 px). */
  let ultimoAplicado = 0;
  let temporizador: ReturnType<typeof setTimeout> | null = null;

  /**
   * Aplica el alto UNA vez, cuando la cosa se queda quieta.
   *
   * Antes se aplicaba en CADA evento (`resize`/`scroll` del viewport visible), y en iPhone la
   * animación del teclado dispara decenas: la app se redimensionaba a saltos mientras el
   * navegador también movía la página. Eso era «hay unos movimientos extraños cuando uno está
   * usando el teclado» (reporte del usuario, 19-09-2026). Ahora se espera a que termine la
   * animación (`RETARDO_DE_ASENTAMIENTO_MS`) y se aplica el valor final de una sola vez; los
   * cambios pequeños (menos de `UMBRAL_CAMBIO_PX`) se ignoran directamente.
   */
  const aplicar = (alto: number, teclado: boolean) => {
    ultimoAplicado = alto;
    // La altura de la app es SIEMPRE lo que se ve de verdad. En iOS hace falta incluso sin
    // teclado: el 100 % es el viewport de maquetación (el de las barras plegadas), así que sin
    // esto el fondo de la app —y la barra de escribir— quedan detrás de la barra de Safari.
    // En Android y en escritorio coincide con la ventana y no cambia nada.
    raiz.style.setProperty(ALTURA_VISIBLE, `${alto}px`);
    if (teclado) {
      // Safari desplaza el documento al enfocar el campo; con la app ya ajustada, ese
      // desplazamiento es el que dejaba un hueco entre la barra de escribir y el teclado.
      window.scrollTo(0, 0);
    }
  };

  const medir = () => {
    const alto = Math.round(vv.height);
    const base = Math.max(estado.base, alto);
    const teclado = base - alto > UMBRAL_TECLADO_PX;
    const cambioDeTeclado = teclado !== estado.teclado;
    publicar({ alto, base, teclado });

    const cambioGrande = Math.abs(alto - ultimoAplicado) > UMBRAL_CAMBIO_PX;
    // Se aplica YA cuando el cambio es grande (el teclado entrando o saliendo): si la app
    // esperara, el navegador desplazaría la página para enseñar el campo y después habría que
    // deshacer ese desplazamiento — eso era el «sube más de lo que ocupa el teclado y luego
    // regresa» que reportó el usuario (19-09-2026). Siguiendo al teclado paso a paso, el campo
    // nunca se sale de lo visible y no hay nada que desplazar.
    if (cambioDeTeclado || cambioGrande || ultimoAplicado === 0) aplicar(alto, teclado);

    // Y siempre se deja puesto el valor DEFINITIVO (los temblores de pocos píxeles no se
    // persiguen uno a uno, pero el último número es el que queda).
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      temporizador = null;
      aplicar(Math.round(vv.height), estado.teclado);
    }, RETARDO_DE_ASENTAMIENTO_MS);
  };

  /** Al enfocar/desenfocar un campo el teclado aparece o se va: se vuelve a medir. */
  const alEnfocar = () => medir();

  medir();
  vv.addEventListener('resize', medir);
  vv.addEventListener('scroll', medir);
  window.addEventListener('orientationchange', medir);
  document.addEventListener('focusin', alEnfocar);
  document.addEventListener('focusout', alEnfocar);
  return () => {
    if (temporizador) clearTimeout(temporizador);
    vv.removeEventListener('resize', medir);
    vv.removeEventListener('scroll', medir);
    window.removeEventListener('orientationchange', medir);
    document.removeEventListener('focusin', alEnfocar);
    document.removeEventListener('focusout', alEnfocar);
    raiz.style.removeProperty(ALTURA_VISIBLE);
  };
}
