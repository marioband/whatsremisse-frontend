#!/usr/bin/env python3
"""Genera el subconjunto de la fuente de iconos con SOLO los iconos que usa la app.

Por qué: `MaterialCommunityIcons.ttf` pesa 1.120 KB y la app usa una veintena de iconos.
Es el archivo más grande que descarga la web (más que todo el código). El subconjunto mide
~2 KB (medido) y se ve exactamente igual.

Cómo se decide qué iconos entran: se buscan en `src/` todos los literales que existan como
clave del mapa de glifos (`glyphmaps/MaterialCommunityIcons.json`). Así queda incluido
cualquier icono que el código pueda pintar, aunque venga de un mapa propio (`ICONS.enviar`).

Uso:
    uv run --python 3.12 --with fonttools python scripts/generar-fuente-de-iconos.py

Deja dos archivos en `scripts/fuentes/`:
    MaterialCommunityIcons-recortada.ttf   (el subconjunto, es lo que se copia al build)
    iconos-recortados.json                 (nombre -> código, para que el build lo verifique)

Después del `expo export:web` hay que correr `node scripts/recortar-fuente-de-iconos.mjs`
(eso sí lo hace el build; este script solo se re-ejecuta si se añaden iconos nuevos).
"""

import json
import os
import pathlib
import re
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
GLIFOS = RAIZ / 'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json'
FUENTE = RAIZ / 'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf'
# OJO: `assets/` quedó de root tras el incidente del build, así que los archivos van
# en `scripts/fuentes/` (que sí es del usuario hermes y viaja en el repo).
SALIDA = RAIZ / 'scripts/fuentes'


def literales_de_src():
    """Todos los literales de cadena de src/ (comillas simples y dobles)."""
    valores = set()
    patron = re.compile(r"'([^'\n]{1,40})'|\"([^\"\n]{1,40})\"")
    for ruta in (RAIZ / 'src').rglob('*'):
        if ruta.suffix not in ('.ts', '.tsx'):
            continue
        for m in patron.finditer(ruta.read_text(encoding='utf-8', errors='replace')):
            valores.add(m.group(1) or m.group(2))
    return valores


def main():
    if not GLIFOS.exists() or not FUENTE.exists():
        sys.exit(f'No encuentro el mapa de glifos o la fuente en node_modules: {GLIFOS}')
    mapa = json.loads(GLIFOS.read_text(encoding='utf-8'))
    usados = sorted(n for n in literales_de_src() if n in mapa)
    if not usados:
        sys.exit('No se encontró ni un icono en src/: ¿cambió la forma de pintar los iconos?')

    SALIDA.mkdir(parents=True, exist_ok=True)
    destino = SALIDA / 'MaterialCommunityIcons-recortada.ttf'
    codigos = [f'{mapa[n]:x}' for n in usados]
    subprocess.run(
        ['pyftsubset', str(FUENTE), f'--unicodes={",".join(codigos)}',
         f'--output-file={destino}', '--no-hinting', '--desubroutinize'],
        check=True,
    )
    (SALIDA / 'iconos-recortados.json').write_text(
        json.dumps({n: mapa[n] for n in usados}, indent=0, ensure_ascii=False) + '\n',
        encoding='utf-8',
    )

    antes = FUENTE.stat().st_size
    ahora = destino.stat().st_size
    print(f'iconos incluidos: {len(usados)}')
    print(f'  {", ".join(usados)}')
    print(f'fuente: {antes / 1024:.0f} KB -> {ahora / 1024:.1f} KB ({(1 - ahora / antes) * 100:.1f} % menos)')
    print(f'escrito: {destino.relative_to(RAIZ)}')


if __name__ == '__main__':
    main()
