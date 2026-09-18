#!/usr/bin/env python3
"""
Genera los iconos de la app instalable (PWA) a partir del logo.

NO se ejecuta en el build: los PNG resultantes se suben al repo (`scripts/pwa/`) y el build
solo los copia (`scripts/pwa-manifest.mjs`). Se vuelve a ejecutar aquí únicamente si cambia
el logo. Necesita Pillow (`uv run --with pillow python scripts/pwa/generar-iconos.py`).

Medidas: el icono es el globo del logo recortado a su tinta, centrado sobre el fondo oscuro
del splash (`#333333`). El normal ocupa el 72 % del lado y el `maskable` el 58 %, porque
Android recorta los maskable en círculo y hay que dejar aire (zona segura).
"""
import os

from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FUENTE = os.path.join(RAIZ, 'assets', 'logo-whatsremisse.png')
DESTINO = os.path.join(RAIZ, 'scripts', 'pwa')
FONDO = (51, 51, 51, 255)  # #333333

ICONOS = [
    (192, 0.72, 'icono-192.png'),
    (512, 0.72, 'icono-512.png'),
    (512, 0.58, 'icono-512-maskable.png'),
    (180, 0.72, 'icono-180-apple.png'),
]


def icono(globo, lado, ocupacion, ruta):
    lienzo = Image.new('RGBA', (lado, lado), FONDO)
    ancho = max(1, int(round(lado * ocupacion)))
    alto = max(1, int(round(ancho * globo.height / globo.width)))
    globo.resize((ancho, alto), Image.LANCZOS)
    lienzo.alpha_composite(globo.resize((ancho, alto), Image.LANCZOS), ((lado - ancho) // 2, (lado - alto) // 2))
    lienzo.save(ruta)
    return ruta


def main():
    os.makedirs(DESTINO, exist_ok=True)
    globo = Image.open(FUENTE).convert('RGBA')
    globo = globo.crop(globo.split()[3].getbbox())  # recortado a su tinta
    for lado, ocupacion, nombre in ICONOS:
        print('escrito:', icono(globo, lado, ocupacion, os.path.join(DESTINO, nombre)))


if __name__ == '__main__':
    main()
