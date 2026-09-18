/**
 * "Copiar datos" del chat del servicio: el TEXTO y, cuando el navegador lo permite,
 * también la IMAGEN del perfil compuesta con esos datos debajo.
 *
 * Por qué la imagen compuesta y no "foto + texto" en el portapapeles: el portapapeles
 * moderno admite los dos formatos a la vez (`ClipboardItem` con `image/png` y
 * `text/plain`), pero **WhatsApp toma UNO**: si hay imagen abre su vista previa con el
 * pie de foto VACÍO (lo escribe el usuario) y si hay texto pega el texto; no los junta.
 * Con los datos dibujados DENTRO de la imagen, al pegarla en WhatsApp sale exactamente
 * lo pedido: la foto arriba y los datos debajo.
 *
 * Requisito del navegador: copiar imágenes necesita origen seguro (HTTPS o localhost).
 * En el 19006 (`http://2.25.124.107:19006`) `navigator.clipboard.write` y
 * `ClipboardItem` no existen, así que ahí se copia el texto como siempre y se ofrece
 * **descargar la imagen** para adjuntarla a mano. El día que la app vaya por HTTPS
 * funciona solo, sin tocar nada.
 *
 * En el móvil conviene otra vía: `navigator.share` con el archivo y el texto, que es
 * como WhatsApp recibe una foto CON su pie de foto (ahí no se pega, se comparte).
 *
 * Módulo con las decisiones en funciones PURAS (probables con node) y el resto detrás
 * de funciones que solo tocan el navegador cuando se llaman.
 */

import { DatosPublicos, conGuion, inicialDe, textoParaCopiar } from './perfilPublico';

export type ViaDeCopiado = 'IMAGEN_Y_TEXTO' | 'COMPARTIR' | 'SOLO_TEXTO';

export interface EntornoDePortapapeles {
  /** Origen seguro (HTTPS o localhost): sin esto no hay portapapeles moderno. */
  origenSeguro: boolean;
  /** `navigator.clipboard.write` + `ClipboardItem` disponibles. */
  puedeCopiarImagen: boolean;
  /** `navigator.share` aceptando archivos (`canShare({files})`). */
  puedeCompartirConArchivo: boolean;
  /** Móvil o tablet: ahí se comparte, no se pega. */
  esMovil: boolean;
  /** Se pudo componer la imagen (hay foto o, al menos, inicial del nombre). */
  hayImagen: boolean;
}

/**
 * Qué se puede hacer con este entorno. Reglas:
 *   - Sin imagen → texto de siempre.
 *   - En el móvil, si se puede compartir archivos → COMPARTIR (WhatsApp recibe la foto
 *     con el texto como pie de foto).
 *   - En escritorio (WhatsApp Web), si hay portapapeles moderno → IMAGEN_Y_TEXTO.
 *   - Lo demás → texto (y la pantalla ofrece descargar la imagen).
 */
export function planDeCopiado(entorno: EntornoDePortapapeles): ViaDeCopiado {
  if (!entorno.hayImagen) return 'SOLO_TEXTO';
  if (entorno.esMovil && entorno.puedeCompartirConArchivo) return 'COMPARTIR';
  if (entorno.puedeCopiarImagen) return 'IMAGEN_Y_TEXTO';
  return 'SOLO_TEXTO';
}

/** Aviso que ve el usuario según lo que de verdad se copió. */
export function textoDelAviso(via: ViaDeCopiado, hayImagen: boolean): string {
  if (via === 'IMAGEN_Y_TEXTO') {
    return 'Copiados con la foto: al pegarlos en WhatsApp sale la imagen y los datos debajo.';
  }
  if (via === 'COMPARTIR') {
    return 'Elige WhatsApp en la ventana que se abrió: la foto va con los datos como pie de foto.';
  }
  if (!hayImagen) {
    return 'Copiados como texto: esta persona no tiene foto de perfil.';
  }
  return 'Copiados como texto: este navegador no deja copiar imágenes (hace falta HTTPS).';
}

/** Nombre del archivo PNG de la imagen compuesta. */
export function nombreDeArchivoDeDatos(datos: DatosPublicos): string {
  const nombre = `${datos.nombres || ''} ${datos.apellidos || ''}`.trim();
  const limpio =
    nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'conductor';
  return `datos-${limpio}.png`;
}

// ---------------------------------------------------------------------------
// Navegador (todo lo de aquí abajo solo se ejecuta en web y al llamarlo)
// ---------------------------------------------------------------------------

const AZUL = '#3F51B5';
const OSCURO = '#2D2D2D';
const TENUE = '#6B7280';
const FONDO = '#F0F2F5';

function hayDocumento(): boolean {
  return typeof document !== 'undefined';
}

function esMovil(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
}

/** Lo que este navegador sabe hacer. No incluye `hayImagen` (eso lo sabe el llamador). */
export function entornoDelPortapapeles(): Omit<EntornoDePortapapeles, 'hayImagen'> {
  const nav: any = typeof navigator === 'undefined' ? undefined : navigator;
  const puedeCopiarImagen =
    !!nav?.clipboard &&
    typeof nav.clipboard.write === 'function' &&
    typeof (globalThis as any).ClipboardItem === 'function';

  let puedeCompartirConArchivo = false;
  if (typeof nav?.share === 'function' && typeof nav?.canShare === 'function') {
    try {
      const prueba = new File([new Uint8Array([1])], 'prueba.png', { type: 'image/png' });
      puedeCompartirConArchivo = !!nav.canShare({ files: [prueba] });
    } catch {
      puedeCompartirConArchivo = false;
    }
  }

  return {
    origenSeguro: typeof window !== 'undefined' ? !!window.isSecureContext : false,
    puedeCopiarImagen,
    puedeCompartirConArchivo,
    esMovil: esMovil(),
  };
}

/** Carga una imagen (foto de perfil) lista para dibujar; null si no se puede. */
async function cargarImagen(url: string): Promise<HTMLImageElement | null> {
  if (!url) return null;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    await new Promise<void>((resolver, rechazar) => {
      img.onload = () => resolver();
      img.onerror = () => rechazar(new Error('no cargó'));
      setTimeout(() => rechazar(new Error('tardó demasiado')), 4000);
    });
    return img;
  } catch {
    return null;
  }
}

/**
 * ¿La imagen se puede DIBUJAR de verdad?
 *
 * Los SVG sin tamaño propio —como los avatares que ofrece el formulario de perfil
 * (`api.dicebear.com/...svg`)— se cargan bien pero al dibujarlos en el canvas no pintan
 * nada: quedaría un círculo blanco. Se comprueba en un canvas pequeño: si no hay ningún
 * píxel con color, se usa la inicial del nombre (que es lo que pinta la app).
 */
function sePuedeDibujar(img: HTMLImageElement): boolean {
  try {
    const prueba = document.createElement('canvas');
    prueba.width = 24;
    prueba.height = 24;
    const ctx = prueba.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, 24, 24);
    const datos = ctx.getImageData(0, 0, 24, 24).data;
    for (let i = 3; i < datos.length; i += 4) {
      if (datos[i] > 0) return true;
    }
    return false;
  } catch {
    // Canvas "manchado" (imagen de otro origen sin CORS): mejor la inicial que nada.
    return false;
  }
}

function circulo(ctx: CanvasRenderingContext2D, x: number, y: number, radio: number): void {
  ctx.beginPath();
  ctx.arc(x, y, radio, 0, Math.PI * 2);
  ctx.closePath();
}

/**
 * Dibuja una tarjeta con la foto del perfil arriba y los datos debajo, y devuelve el PNG.
 * Sin foto (o si no carga) dibuja la inicial del nombre: la imagen siempre sale.
 */
export async function componerImagenDeDatos(
  datos: DatosPublicos,
  titulo = 'Datos del Conductor'
): Promise<Blob | null> {
  if (!hayDocumento()) return null;

  const ANCHO = 900;
  const cargada = datos.foto ? await cargarImagen(datos.foto) : null;
  const foto = cargada && sePuedeDibujar(cargada) ? cargada : null;

  const filas: [string, string][] = [
    ['Nombres', datos.nombres],
    ['Apellidos', datos.apellidos],
    ['DNI', datos.dni],
    ['Teléfono', datos.telefono],
  ];
  const filasVehiculo: [string, string][] = [
    ['Marca', datos.marca],
    ['Modelo', datos.modelo],
    ['Color', datos.color],
    ['Placa', datos.placa],
  ];

  const ALTO_CABECERA = 300;
  const ALTO_FILA = 64;
  const ALTO_SECCION = 76;
  const ALTO_PIE = 76;
  const ALTO =
    ALTO_CABECERA +
    filas.length * ALTO_FILA +
    ALTO_SECCION +
    filasVehiculo.length * ALTO_FILA +
    ALTO_PIE;

  const canvas = document.createElement('canvas');
  canvas.width = ANCHO;
  canvas.height = ALTO;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const familia = "'Helvetica Neue', Helvetica, Arial, sans-serif";

  // Fondo general y cabecera con el azul de la marca.
  ctx.fillStyle = FONDO;
  ctx.fillRect(0, 0, ANCHO, ALTO);
  ctx.fillStyle = AZUL;
  ctx.fillRect(0, 0, ANCHO, ALTO_CABECERA);

  // Foto circular (o inicial). El fondo del círculo es OSCURO, como el avatar de la app:
  // así una foto con transparencia (o clara, como el logo de la marca) sigue viéndose.
  const radio = 88;
  const centroY = 132;
  ctx.save();
  circulo(ctx, ANCHO / 2, centroY, radio);
  ctx.fillStyle = OSCURO;
  ctx.fill();
  ctx.clip();
  if (foto && foto.naturalWidth > 0) {
    const lado = Math.min(foto.naturalWidth, foto.naturalHeight);
    ctx.drawImage(
      foto,
      (foto.naturalWidth - lado) / 2,
      (foto.naturalHeight - lado) / 2,
      lado,
      lado,
      ANCHO / 2 - radio,
      centroY - radio,
      radio * 2,
      radio * 2
    );
  } else {
    ctx.fillStyle = OSCURO;
    ctx.fillRect(ANCHO / 2 - radio, centroY - radio, radio * 2, radio * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold 96px ${familia}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(inicialDe(datos), ANCHO / 2, centroY + 4);
  }
  ctx.restore();

  // Título y nombre, centrados bajo la foto.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 40px ${familia}`;
  ctx.fillText(titulo, ANCHO / 2, 262);

  // Cuerpo: filas etiqueta (azul) + valor (oscuro).
  let y = ALTO_CABECERA + 46;
  const pintarFila = (etiqueta: string, valor: string) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = TENUE;
    ctx.font = `26px ${familia}`;
    ctx.fillText(etiqueta, 70, y);
    ctx.fillStyle = OSCURO;
    ctx.font = `bold 32px ${familia}`;
    ctx.fillText(conGuion(valor), 70, y + 34);
    y += ALTO_FILA;
  };

  filas.forEach(([etiqueta, valor]) => pintarFila(etiqueta, valor));

  // Sección de vehículo
  y += 10;
  ctx.textAlign = 'left';
  ctx.fillStyle = AZUL;
  ctx.font = `bold 30px ${familia}`;
  ctx.fillText('Datos del Vehículo', 70, y);
  ctx.fillStyle = '#D7DBE8';
  ctx.fillRect(70, y + 16, ANCHO - 140, 2);
  y += ALTO_SECCION - 30;

  filasVehiculo.forEach(([etiqueta, valor]) => pintarFila(etiqueta, valor));

  // Pie
  ctx.fillStyle = AZUL;
  ctx.fillRect(0, ALTO - ALTO_PIE, ANCHO, ALTO_PIE);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 26px ${familia}`;
  ctx.textAlign = 'center';
  ctx.fillText('WhatsRemisse', ANCHO / 2, ALTO - 28);

  return new Promise<Blob | null>((resolver) => {
    canvas.toBlob((blob) => resolver(blob), 'image/png');
  });
}

/** Descarga la imagen compuesta (sirve cuando el portapapeles no admite imágenes). */
export function descargarImagen(blob: Blob, nombre: string): void {
  if (!hayDocumento()) return;
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export interface ResultadoDeCopiado {
  via: ViaDeCopiado;
  /** El texto de siempre (siempre se copia: es el respaldo de WhatsApp Web). */
  texto: string;
  /** La imagen compuesta, si se pudo hacer (para descargarla si la vía fue texto). */
  imagen: Blob | null;
  /** El usuario canceló la hoja de compartir (no hay que avisar de error). */
  cancelado?: boolean;
}

export interface OpcionesDeCopiado {
  titulo?: string;
  /** Copiado de texto del proyecto (expo-clipboard hoy): se inyecta para poder probar. */
  copiarTexto: (texto: string) => Promise<unknown>;
}

/**
 * Copia los datos del servicio por la mejor vía disponible y dice cuál se usó.
 *
 * Nunca falla por no poder copiar la imagen: en el peor caso copia el texto, que es lo
 * que hacía antes, y devuelve la imagen para que la pantalla ofrezca descargarla.
 */
export async function copiarDatosDelServicio(
  datos: DatosPublicos,
  opciones: OpcionesDeCopiado
): Promise<ResultadoDeCopiado> {
  const titulo = opciones.titulo ?? 'Datos del Conductor';
  const texto = textoParaCopiar(datos, titulo);

  let imagen: Blob | null = null;
  try {
    imagen = await componerImagenDeDatos(datos, titulo);
  } catch {
    imagen = null;
  }

  const entorno = entornoDelPortapapeles();
  const via = planDeCopiado({ ...entorno, hayImagen: !!imagen });

  if (via === 'IMAGEN_Y_TEXTO' && imagen) {
    try {
      const ClipboardItemCtor = (globalThis as any).ClipboardItem;
      const articulo = new ClipboardItemCtor({
        'image/png': imagen,
        'text/plain': new Blob([texto], { type: 'text/plain' }),
      });
      await (navigator as any).clipboard.write([articulo]);
      return { via, texto, imagen };
    } catch {
      // Si el navegador se niega, se sigue con el texto (nunca se queda sin copiar).
    }
  }

  if (via === 'COMPARTIR' && imagen) {
    try {
      const archivo = new File([imagen], nombreDeArchivoDeDatos(datos), { type: 'image/png' });
      await (navigator as any).share({ files: [archivo], text: texto });
      return { via, texto, imagen };
    } catch (err) {
      const cancelado = (err as Error)?.name === 'AbortError';
      if (!cancelado) {
        // Si compartir falló de verdad, al menos queda el texto copiado.
        await opciones.copiarTexto(texto);
        return { via: 'SOLO_TEXTO', texto, imagen };
      }
      return { via, texto, imagen, cancelado: true };
    }
  }

  await opciones.copiarTexto(texto);
  return { via: 'SOLO_TEXTO', texto, imagen };
}
