/**
 * Copiar una foto de la app (`Datos conductor`, tarjeta del postulante…).
 *
 * Qué hace, en orden, y por qué en ese orden:
 *
 *  1. **Portapapeles** (`navigator.clipboard.write` con un PNG): lo que el usuario pidió —
 *     «copiarla para pegarla en cualquier otro lado». Funciona en Chrome/Edge de escritorio.
 *  2. **Compartir** (`navigator.share` con el archivo): **en iPhone es la vía real** —Safari
 *     NO deja escribir imágenes en el portapapeles—, así que se abre la hoja de compartir
 *     («Guardar en Fotos», WhatsApp, correo…). El usuario pidió «copiar»: en iPhone el
 *     equivalente honesto es esto, y la app lo dice con esas palabras.
 *  3. **Descargar** el archivo, si el navegador no permite ninguna de las dos.
 *
 * Devuelve qué pasó, para que la pantalla lo cuente. Nunca lanza: si no se pudo, devuelve
 * `no-se-pudo` (y la pantalla lo dice), porque un botón que no dice nada es peor que un aviso.
 */
export type ResultadoDeCopiarImagen = 'copiada' | 'compartida' | 'descargada' | 'no-se-pudo';

/** Texto para el usuario, según lo que haya pasado. */
export function mensajeDeCopiarImagen(resultado: ResultadoDeCopiarImagen): string {
  switch (resultado) {
    case 'copiada':
      return 'Foto copiada. Ya puedes pegarla en otro lado.';
    case 'compartida':
      return 'Elige dónde quieres la foto: Guardar en Fotos, WhatsApp…';
    case 'descargada':
      return 'Tu navegador no deja copiar la foto; se descargó el archivo.';
    default:
      return 'No se pudo copiar la foto. Inténtalo otra vez.';
  }
}

function nombreSeguro(nombre: string): string {
  const limpio = (nombre || 'conductor').trim().replace(/[^\w\-]+/g, '-');
  return limpio.toLowerCase().endsWith('.png') ? limpio : `${limpio}.png`;
}

export async function copiarOCompartirImagen(
  url: string,
  nombreArchivo = 'conductor'
): Promise<ResultadoDeCopiarImagen> {
  if (!url) return 'no-se-pudo';
  const nombre = nombreSeguro(nombreArchivo);

  let blob: Blob | null = null;
  try {
    const respuesta = await fetch(url);
    if (respuesta.ok) blob = await respuesta.blob();
  } catch {
    blob = null;
  }
  if (!blob || blob.size === 0) return 'no-se-pudo';

  const tipo = blob.type || 'image/png';

  // 1) al portapapeles (escritorio)
  try {
    const portapapeles = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    const hayClipboardItem = typeof ClipboardItem !== 'undefined';
    if (portapapeles && typeof portapapeles.write === 'function' && hayClipboardItem) {
      await portapapeles.write([new ClipboardItem({ [tipo]: blob })]);
      return 'copiada';
    }
  } catch {
    /* se intenta compartir */
  }

  // 2) la hoja de compartir (la vía del iPhone)
  try {
    const archivo = new File([blob], nombre, { type: tipo });
    const nav = navigator as Navigator & { canShare?: (datos: unknown) => boolean };
    if (typeof nav.share === 'function' && (!nav.canShare || nav.canShare({ files: [archivo] }))) {
      await nav.share({ files: [archivo], title: nombre });
      return 'compartida';
    }
  } catch {
    /* se intenta descargar */
  }

  // 3) descargar
  try {
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(blob);
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    setTimeout(() => URL.revokeObjectURL(enlace.href), 10_000);
    return 'descargada';
  } catch {
    return 'no-se-pudo';
  }
}
