#!/usr/bin/env python3
"""
Genera los iconos de la app instalable (PWA) a partir de la marca.

NO se ejecuta en el build: los PNG resultantes viven en `scripts/pwa/` (subidos al repo) y el
build solo los copia (`scripts/pwa-manifest.mjs`). Se vuelve a ejecutar aquí únicamente si
cambia el logo. Necesita Pillow: `uv run --with pillow python scripts/pwa/generar-iconos.py`.

De dónde sale `fuente-logo.png` (el globo con la persona, 1378x1388):
  1. El asset es `assets/logo-whatsremisse.svg` (el mismo archivo que pasó el usuario el
     18-09-2026; viewBox 0 0 1080 1080, 4 paths en blanco y el nombre "WhatsRemisse" en
     Helvetica Neue Bold).
  2. Ese SVG trae el nombre debajo. El usuario decidió el 18-09-2026 que el icono del app es
     **solo el globo con la persona**, así que se recortó.
  3. Se rasterizó en el navegador del banco sobre el fondo del splash (`#333333`) a 2160x2160
     (2x) y se recortó la caja del globo: (391, 116, 1769, 1504) de esa imagen.
     OJO con la fuente: el SVG pide `HelveticaNeueLTStd-Bd`, que no existe en el contenedor
     (el nombre salía en serif); si algún día se rehace CON el nombre, hay que parchear la
     familia a `Arial, Helvetica, 'Liberation Sans', 'DejaVu Sans', sans-serif; font-weight: 700`
     y escalar el <text> al 90 % (con Arial mide 1030 de 1080 y se cortaba la última letra).

Medidas: el globo ocupa el 72 % del lado en los iconos normales y el 58 % en el `maskable`
(Android recorta los maskable en círculo: hay que dejar aire).
"""
import os

from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FUENTE = os.path.join(RAIZ, 'scripts', 'pwa', 'fuente-logo.png')
DESTINO = os.path.join(RAIZ, 'scripts', 'pwa')
FONDO = (51, 51, 51)  # #333333, el del splash y el background_color del manifest

ICONOS = [
    (192, 0.72, 'icono-192.png'),
    (512, 0.72, 'icono-512.png'),
    (512, 0.58, 'icono-512-maskable.png'),
    (180, 0.72, 'icono-180-apple.png'),
]


def icono(marca, lado, ocupacion):
    """Cuadrado de `lado` px: la marca centrada, a `ocupacion` del lado, sobre el fondo."""
    objetivo = max(1, int(round(lado * ocupacion)))
    escala = min(objetivo / marca.width, objetivo / marca.height)
    ancho = max(1, int(round(marca.width * escala)))
    alto = max(1, int(round(marca.height * escala)))
    lienzo = Image.new('RGBA', (lado, lado), FONDO)
    lienzo.alpha_composite(marca.resize((ancho, alto), Image.LANCZOS), ((lado - ancho) // 2, (lado - alto) // 2))
    return lienzo


def main():
    marca = Image.open(FUENTE).convert('RGBA')
    for lado, ocupacion, nombre in ICONOS:
        ruta = os.path.join(DESTINO, nombre)
        icono(marca, lado, ocupacion).save(ruta)
        print('escrito:', ruta)


if __name__ == '__main__':
    main()
