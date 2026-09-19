/**
 * Copia el service worker de avisos al build web.
 *
 * `expo export:web` NO copia la carpeta `public/`: si este paso no se da, `/sw-avisos.js` no
 * existe en el sitio y el navegador no puede suscribirse (los avisos no se activan). Se engancha
 * en `build:web`, junto al recorte de iconos y el manifiesto.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const raiz = process.cwd();
const origen = join(raiz, 'public', 'sw-avisos.js');
const destino = join(raiz, 'web-build', 'sw-avisos.js');

if (!existsSync(origen)) {
  // Aviso, NO error: un despliegue no puede quedarse a medias por una pieza opcional. Si esto
  // sale, los avisos no se podrán activar (el navegador no encontrará `/sw-avisos.js`), pero la
  // app funciona igual. Antes cortaba el build entero y tumbaba el despliegue (19-09-2026).
  console.warn('[service-worker] ATENCIÓN: falta public/sw-avisos.js — los avisos no se podrán activar');
  process.exit(0);
}
mkdirSync(dirname(destino), { recursive: true });
copyFileSync(origen, destino);
console.log('[service-worker] sw-avisos.js copiado a web-build/ (solo avisos, sin caché)');
