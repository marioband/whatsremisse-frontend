#!/usr/bin/env node
/**
 * Mete la fuente de iconos RECORTADA en el build web.
 *
 * `MaterialCommunityIcons.ttf` pesa 1.120 KB y la app usa una treintena de iconos: es el
 * archivo más grande que descarga la web (más que todo el código). `scripts/fuentes/` tiene
 * el subconjunto (~4 KB) y su manifiesto; este paso lo copia ENCIMA del archivo que dejó
 * `expo export:web`, conservando el nombre, así que ninguna referencia del bundle cambia.
 *
 * Se corre DESPUÉS del build (ver `references/peso-y-velocidad.md` del skill):
 *     npx expo export:web --clear && node scripts/recortar-fuente-de-iconos.mjs
 *
 * Si algún icono que el código pinta NO está en el subconjunto, NO se toca nada: se avisa y
 * se dice cómo regenerarlo (`uv run --python 3.12 --with fonttools python
 * scripts/generar-fuente-de-iconos.py`). Así el peor caso es «no se ahorra», nunca «sale un
 * cuadro en vez del icono».
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(RAIZ, 'src');
const MEDIA = path.join(RAIZ, 'web-build', 'static', 'media');
const SUBCONJUNTO = path.join(RAIZ, 'scripts', 'fuentes', 'MaterialCommunityIcons-recortada.ttf');
const MANIFIESTO = path.join(RAIZ, 'scripts', 'fuentes', 'iconos-recortados.json');
const GLIFOS = path.join(
  RAIZ,
  'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json'
);

const aviso = (msg) => console.log(`[fuente-de-iconos] ${msg}`);

if (!fs.existsSync(SUBCONJUNTO) || !fs.existsSync(MANIFIESTO)) {
  aviso('no hay subconjunto generado; se deja la fuente completa. Genéralo con:');
  aviso('  uv run --python 3.12 --with fonttools python scripts/generar-fuente-de-iconos.py');
  process.exit(0);
}
if (!fs.existsSync(GLIFOS)) {
  aviso('no encuentro el mapa de glifos en node_modules; no se toca nada.');
  process.exit(0);
}

const glyphmap = JSON.parse(fs.readFileSync(GLIFOS, 'utf8'));
const incluidos = JSON.parse(fs.readFileSync(MANIFIESTO, 'utf8'));

/** Archivos que pintan iconos: los que importan la librería de vectores. */
const recorrer = (dir, encontrados = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(p, encontrados);
    else if (/\.tsx?$/.test(e.name)) encontrados.push(p);
  }
  return encontrados;
};

const pintanIconos = recorrer(SRC).filter((p) => {
  const t = fs.readFileSync(p, 'utf8');
  return /@expo\/vector-icons|react-native-vector-icons/.test(t);
});

/** Iconos que el código NOMBRA de verdad (literales que existen en el mapa de glifos). */
const usados = new Set();
for (const p of pintanIconos) {
  const t = fs.readFileSync(p, 'utf8');
  for (const m of t.matchAll(/'([^'\n]{1,40})'|"([^"\n]{1,40})"/g)) {
    const valor = m[1] || m[2];
    if (Object.prototype.hasOwnProperty.call(glyphmap, valor)) usados.add(valor);
  }
}

const faltan = [...usados].filter((n) => !(n in incluidos));
if (faltan.length) {
  aviso(`el código usa iconos que NO están en el subconjunto: ${faltan.join(', ')}`);
  aviso('se deja la fuente completa (no se rompe nada, pero pesa 1.120 KB). Regenera con:');
  aviso('  uv run --python 3.12 --with fonttools python scripts/generar-fuente-de-iconos.py');
  process.exit(0);
}
if (!usados.size) {
  aviso('no se encontró ningún icono en el código; no se toca nada.');
  process.exit(0);
}

const fuentes = fs.existsSync(MEDIA)
  ? fs.readdirSync(MEDIA).filter((f) => /^MaterialCommunityIcons\..*\.ttf$/.test(f))
  : [];
if (!fuentes.length) {
  aviso(`no hay fuente de iconos en ${path.relative(RAIZ, MEDIA)}; ¿se corrió el build?`);
  process.exit(0);
}

const bytes = fs.readFileSync(SUBCONJUNTO);
for (const f of fuentes) {
  const destino = path.join(MEDIA, f);
  const antes = fs.statSync(destino).size;
  fs.writeFileSync(destino, bytes);
  aviso(`${f}: ${(antes / 1024).toFixed(0)} KB -> ${(bytes.length / 1024).toFixed(1)} KB`);
}
aviso(`listo con ${usados.size} iconos: ${[...usados].sort().join(', ')}`);
