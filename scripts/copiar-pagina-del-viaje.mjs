/**
 * Copia la página pública del viaje al build web.
 *
 * `expo export:web` NO copia la carpeta `public/` (el mismo motivo por el que existe
 * `copiar-service-worker.mjs`): si este paso no se da, `/viaje/<token>` no existe en el
 * sitio y nginx no tiene qué servir. Se engancha en `build:web`, junto al resto.
 *
 * Si falta la página, AVISA pero no tumba el build: la configuración de nginx ya responde
 * 404 claro, y el publicador (`deploy-web.sh`) tiene su propio respaldo de copia.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const raiz = process.cwd();
const origen = join(raiz, 'public', 'viaje');
const destino = join(raiz, 'web-build', 'viaje');

if (!existsSync(join(origen, 'index.html'))) {
  // Aviso, NO error: un despliegue no puede quedarse a medias por una pieza.
  console.warn('[pagina-del-viaje] ATENCIÓN: falta public/viaje/index.html — el enlace del viaje no se podrá abrir');
  process.exit(0);
}
mkdirSync(destino, { recursive: true });
cpSync(origen, destino, { recursive: true });
console.log('[pagina-del-viaje] public/viaje copiada a web-build/viaje (la página del cliente)');
