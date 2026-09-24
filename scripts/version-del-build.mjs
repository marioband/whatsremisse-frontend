#!/usr/bin/env node
/**
 * Escribe el SELLO DE VERSIÓN del despliegue (etapa de pruebas de campo, 24-09-2026).
 *
 * Para qué: cuando la app está instalada en los teléfonos hay que poder decirle al usuario «hay una
 * versión nueva» y no dejarlo trabajar con la vieja. Eso necesita dos cosas que este script deja en
 * el build:
 *
 *   1. `web-build/version.json` — lo que la app CONSULTA al servidor (nunca desde la caché):
 *      { version, fecha, urgente }.
 *   2. dos metas en el `index.html` (`wr-version` y `wr-version-fecha`) — para que la app sepa SU
 *      PROPIA versión, sin inyectarla en el código fuente (eso ensuciaría el repositorio).
 *
 * `urgente` se marca creando el archivo `deploy/actualizacion-urgente.txt` antes de desplegar: ese
 * despliegue bloquea a todo el mundo en el acto, aunque esté en medio de un servicio.
 *
 * Si algo falta (no hay bundle), AVISA y sale con 0: un despliegue no se cae por esto.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const raiz = process.cwd();
const build = join(raiz, 'web-build');
const carpetaJs = join(build, 'static', 'js');

if (!existsSync(carpetaJs)) {
  console.warn('[version] ATENCIÓN: no hay web-build/static/js — no se escribe el sello de versión');
  process.exit(0);
}

const principal = readdirSync(carpetaJs).find((nombre) => /^main\.[a-z0-9]+\.js$/.test(nombre));
if (!principal) {
  console.warn('[version] ATENCIÓN: no se encontró main.<hash>.js — no se escribe el sello');
  process.exit(0);
}

const hash = principal.replace(/^main\./, '').replace(/\.js$/, '');
const version = hash.slice(0, 8);
const fecha = new Date().toISOString();
const urgente = existsSync(join(raiz, 'deploy', 'actualizacion-urgente.txt'));

writeFileSync(join(build, 'version.json'), JSON.stringify({ version, fecha, urgente }, null, 2) + '\n');

const rutaHtml = join(build, 'index.html');
if (existsSync(rutaHtml)) {
  const sinMetas = readFileSync(rutaHtml, 'utf8')
    .replace(/\s*<meta name="wr-version"[^>]*>/g, '')
    .replace(/\s*<meta name="wr-version-fecha"[^>]*>/g, '');
  const conMetas = sinMetas.replace(
    '</head>',
    '  <meta name="wr-version" content="' + version + '" />\n' +
      '  <meta name="wr-version-fecha" content="' + fecha + '" />\n</head>'
  );
  writeFileSync(rutaHtml, conMetas);
} else {
  console.warn('[version] ATENCIÓN: no hay web-build/index.html — la app no sabrá su versión');
}

console.log(
  '[version] sello escrito: ' + version + ' (' + fecha + ')' + (urgente ? ' — MARCADA COMO URGENTE' : '')
);
