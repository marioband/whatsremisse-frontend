#!/bin/bash
# ============================================================================
# El mapa propio del seguimiento (sin costo por uso): se baja UNA vez al VPS
# y el dominio lo sirve desde /mapa/. Ejecutar como root, desde el árbol:
#     cd /opt/data/whatsremisse/frontend && sudo bash deploy/mapa.sh
#
# Qué baja (archivos del mapa de Protomaps + OpenStreetMap):
#   peru.pmtiles : todo el Perú hasta zoom 11  (vista general del viaje)
#   lima.pmtiles : Lima y Callao hasta zoom 15 (las calles de la operación)
# Si algún día se opera en otra ciudad, se agrega su recorte con BBOX_ALCANCE.
#
# Variables (opcionales):
#   DESTINO=/var/www/mapa            carpeta que sirve nginx (location /mapa/)
#   MAXZOOM_LIMA=15 / MAXZOOM_PAIS=11
#   FORZAR=1                         vuelve a bajarlos aunque ya estén
# ============================================================================
set -euo pipefail

DESTINO="${DESTINO:-/var/www/mapa}"
BBOX_PAIS="${BBOX_PAIS:--81.5,-18.5,-68.5,0.5}"
MAXZOOM_PAIS="${MAXZOOM_PAIS:-11}"
BBOX_LIMA="${BBOX_LIMA:--77.25,-12.40,-76.75,-11.75}"
MAXZOOM_LIMA="${MAXZOOM_LIMA:-15}"

echo "=== WhatsRemisse: el mapa del VPS ==="
echo "destino: $DESTINO"

if [ "$(id -u)" != "0" ]; then
  echo "ERROR: correr con sudo (hay que escribir en $DESTINO)."
  exit 1
fi

mkdir -p "$DESTINO"

# --------------------------------------------------------------------------
# 1) La herramienta (pmtiles): un binario suelto en /usr/local/bin
# --------------------------------------------------------------------------
if ! command -v pmtiles >/dev/null 2>&1; then
  echo "=== Bajando la herramienta pmtiles ==="
  URL="$(curl -s https://api.github.com/repos/protomaps/go-pmtiles/releases/latest \
        | grep -oE 'https://[^"]*go-pmtiles_[0-9.]+_Linux_x86_64\.tar\.gz' | head -1)"
  if [ -z "$URL" ]; then
    echo "ERROR: no se encontró la herramienta (¿sin internet, o cambió el enlace del proyecto?)."
    exit 1
  fi
  curl -sL -o /tmp/pmtiles.tar.gz "$URL"
  tar xzf /tmp/pmtiles.tar.gz -C /usr/local/bin pmtiles 2>/dev/null \
    || { tar xzf /tmp/pmtiles.tar.gz -C /tmp; cp /tmp/pmtiles /usr/local/bin/pmtiles; }
  chmod +x /usr/local/bin/pmtiles
fi
pmtiles version | head -1

# --------------------------------------------------------------------------
# 2) El día del mapa (los "builds" salen a diario; se usa el más reciente)
# --------------------------------------------------------------------------
FECHA=""
for ATRAS in 0 1 2 3; do
  DIA="$(date -u -d "-$ATRAS day" +%Y%m%d)"
  CODIGO="$(curl -s -o /dev/null -w '%{http_code}' -I "https://build.protomaps.com/$DIA.pmtiles")"
  if [ "$CODIGO" = "200" ]; then FECHA="$DIA"; break; fi
done
if [ -z "$FECHA" ]; then
  echo "ERROR: no se encontró el mapa del día (¿sin internet?)."
  exit 1
fi
echo "=== Mapa del día: $FECHA ==="

# --------------------------------------------------------------------------
# 3) Los dos recortes
# --------------------------------------------------------------------------
bajar_recorte() {
  local nombre="$1" bbox="$2" maxzoom="$3"
  if [ -s "$DESTINO/$nombre.pmtiles" ] && [ "${FORZAR:-0}" != "1" ]; then
    echo "=== $nombre.pmtiles ya está ($(du -h "$DESTINO/$nombre.pmtiles" | cut -f1)): se salta (FORZAR=1 para rehacerlo) ==="
    return
  fi
  echo "=== Bajando $nombre.pmtiles (puede tardar unos minutos) ==="
  pmtiles extract "https://build.protomaps.com/$FECHA.pmtiles" "$DESTINO/$nombre.pmtiles" \
    --bbox="$bbox" --maxzoom="$maxzoom"
}
bajar_recorte peru "$BBOX_PAIS" "$MAXZOOM_PAIS"
bajar_recorte lima "$BBOX_LIMA" "$MAXZOOM_LIMA"

# --------------------------------------------------------------------------
# 4) Resumen
# --------------------------------------------------------------------------
echo
echo "=== Listo. Lo que quedó en $DESTINO: ==="
ls -lh "$DESTINO"/*.pmtiles
echo
df -h "$DESTINO" | tail -1
echo
echo "Para que el dominio lo sirva, la configuración de nginx tiene que tener el bloque /mapa/"
echo "(viene en deploy/nginx-default.conf: cp + nginx -t + reload)."
