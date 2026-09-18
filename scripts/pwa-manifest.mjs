/**
 * Deja el manifest listo para que la app se INSTALE como app en el teléfono.
 *
 * Por qué existe (18-09-2026, reporte del usuario: "en Android con Chrome, después de instalar
 * la app y entrar desde el icono, se ve como una página web normal, con la barra de direcciones
 * arriba"): el `manifest.json` que genera `expo export:web` no cumplía dos criterios de
 * instalación de Chromium, y con eso Chrome crea un ACCESO DIRECTO (abre en una pestaña con
 * barra de direcciones) en vez de una app instalada (WebAPK, que abre a pantalla completa):
 *
 *   1. NO traía `icons`. Chromium exige un icono de 192 px Y otro de 512 px.
 *   2. Traía `prefer_related_applications: true` (lo pone Expo a partir de los ids nativos de
 *      `app.json`). Con eso Android manda a la tienda de aplicaciones en lugar de instalar la
 *      web (documentado en web.dev: "the user will be directed to the Google Play store").
 *
 * También conviene saber que el service worker NO es obligatorio para instalar desde el menú
 * (Chrome lo dejó de exigir en la versión 108 en móvil): solo hace falta para el aviso
 * automático `beforeinstallprompt`. Aquí NO se añade ninguno a propósito — un service worker
 * mal hecho (o vacío) devuelve JS viejo y rompe cosas peores que la barra de direcciones.
 *
 * Los PNG viven en `scripts/pwa/` (no en `assets/`: esa carpeta es de root en el contenedor y
 * el proceso no puede crear archivos ahí) y se copian al build. Se regeneran con
 * `scripts/pwa/generar-iconos.py` solo si cambia el logo.
 *
 * Corre automáticamente al final de `npm run build:web`. Si algo falta, AVISA y deja el build
 * como estaba: un manifest incompleto deja el acceso directo (molesto), pero nunca rompe la app.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = join(RAIZ, 'web-build');
const ORIGEN = join(RAIZ, 'scripts', 'pwa');
const DESTINO = join(BUILD, 'pwa', 'icons');
const MANIFEST = join(BUILD, 'manifest.json');
const INDEX = join(BUILD, 'index.html');

/** Los iconos que exige Chromium, con el nombre de archivo del que se copia. */
const ICONOS = [
  { archivo: 'icono-192.png', sizes: '192x192', purpose: 'any' },
  { archivo: 'icono-512.png', sizes: '512x512', purpose: 'any' },
  { archivo: 'icono-512-maskable.png', sizes: '512x512', purpose: 'maskable' },
  { archivo: 'icono-180-apple.png', sizes: '180x180', purpose: 'any' },
];

/** Lo que tiene que decir el manifest para que la app se instale como app. */
const FIJO = {
  name: 'WhatsRemisse',
  short_name: 'WhatsRemisse',
  description: 'Servicios de transporte con tus grupos: conductor, proveedor y coordinación.',
  lang: 'es',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#333333',
  theme_color: '#333333',
  // Sin esto Android manda a la tienda de aplicaciones en vez de instalar la web.
  prefer_related_applications: false,
};

const avisos = [];
const hecho = [];

if (!existsSync(BUILD)) {
  console.error('[pwa] no existe web-build: ¿se ejecutó el export antes?');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1) Copiar los iconos al build
// ---------------------------------------------------------------------------
const faltan = ICONOS.filter((i) => !existsSync(join(ORIGEN, i.archivo)));
if (faltan.length) {
  avisos.push(
    `faltan iconos en scripts/pwa/: ${faltan.map((f) => f.archivo).join(', ')} ` +
      '(sin los de 192 y 512 la app NO se instala como app: queda un acceso directo con barra de direcciones)'
  );
} else {
  mkdirSync(DESTINO, { recursive: true });
  for (const icono of ICONOS) {
    copyFileSync(join(ORIGEN, icono.archivo), join(DESTINO, icono.archivo));
  }
  hecho.push(`${ICONOS.length} iconos copiados a pwa/icons/`);
}

// ---------------------------------------------------------------------------
// 2) Escribir el manifest
// ---------------------------------------------------------------------------
let manifest = {};
if (existsSync(MANIFEST)) {
  try {
    manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  } catch {
    avisos.push('el manifest.json del build no era JSON válido: se reescribe desde cero');
  }
}

const siguiente = { ...manifest, ...FIJO };
if (!faltan.length) {
  siguiente.icons = ICONOS.map((i) => ({
    src: `/pwa/icons/${i.archivo}`,
    sizes: i.sizes,
    type: 'image/png',
    purpose: i.purpose,
  }));
}
// `related_applications` se conserva (documenta las apps nativas), pero ya no se prefieren.
writeFileSync(MANIFEST, JSON.stringify(siguiente, null, 2) + '\n');
hecho.push('manifest.json escrito (display standalone, prefer_related_applications: false)');

// ---------------------------------------------------------------------------
// 3) El index: enlace al manifest y favicon (si el export no los puso)
// ---------------------------------------------------------------------------
if (existsSync(INDEX)) {
  let html = readFileSync(INDEX, 'utf8');
  const antes = html;
  if (!/rel="manifest"/.test(html)) {
    html = html.replace('</head>', '<link rel="manifest" href="/manifest.json"></head>');
  }
  if (!/rel="icon"/.test(html) && !faltan.length) {
    html = html.replace(
      '</head>',
      '<link rel="icon" type="image/png" href="/pwa/icons/icono-192.png"></head>'
    );
  }
  if (html !== antes) {
    writeFileSync(INDEX, html);
    hecho.push('index.html: enlace al manifest y favicon');
  }
}

// ---------------------------------------------------------------------------
// 4) Resumen
// ---------------------------------------------------------------------------
console.log('[pwa] ' + hecho.join(' · '));
for (const a of avisos) console.warn('[pwa] AVISO: ' + a);
if (!avisos.length) {
  console.log('[pwa] la app cumple los criterios de instalación de Chrome/Android');
}
