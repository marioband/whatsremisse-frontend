#!/bin/bash
# Despliegue de WhatsRemisse web en el VPS (dominio publico https://whatsremisse.tech)
#
# Ejecutar como root o con sudo, DESDE el arbol del proyecto:
#     cd /opt/data/whatsremisse/frontend && sudo bash deploy-web.sh
#
# Que hace, en orden:
#   1) apunta la app al backend PUBLICO (https://whatsremisse.tech) escribiendolo en .env,
#      con copia de seguridad del .env anterior;
#   2) compila el export web con `npm run build:web` (export + recorte de la fuente de
#      iconos: el recorte es lo que baja el peso, no saltarlo);
#   3) pasa el verificador del build (0 referencias a `process`, EXPO_PUBLIC_* incrustadas);
#   4) copia el build a la carpeta que sirve nginx, guardando la anterior como respaldo;
#   5) comprueba que el dominio ya sirve el archivo nuevo (sha256).
#
# NO toca nginx: el sitio ya funciona (HTTPS con certificado valido y el backend en el
# mismo dominio). Reescribir la configuracion desde el repo es lo que puede romperlo,
# porque el nginx.conf del repo es un `server` de comodin (`server_name _`, escucha en el
# 80) que NO lleva el proxy del backend (/rest/v1, /auth/v1, /realtime/v1, /storage/v1).
#
# Variables opcionales:
#   API_URL=https://otra.url   backend a incrustar (por defecto https://whatsremisse.tech)
#   DESTINO=/var/www/...       carpeta que sirve nginx (por defecto la del sitio)
#   SALTAR_BUILD=1             no compila: usa el web-build que ya hay (para reintentar solo la copia)
set -euo pipefail

API_URL="${API_URL:-https://whatsremisse.tech}"
DESTINO="${DESTINO:-/var/www/whatsremisse/web-build}"
ARBOL="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FECHA="$(date +%Y%m%d-%H%M%S)"

cd "$ARBOL"
echo "=== WhatsRemisse: despliegue web ==="
echo "arbol:   $ARBOL"
echo "backend: $API_URL"
echo "destino: $DESTINO"

# ---------------------------------------------------------------------------
# 0) Comprobaciones previas
# ---------------------------------------------------------------------------
if [ ! -d "$(dirname "$DESTINO")" ]; then
  echo "ERROR: no existe $(dirname "$DESTINO")."
  echo "Comprueba donde sirve nginx con:  nginx -T | grep -n 'root'"
  echo "y repite con:  DESTINO=<esa carpeta> sudo -E bash deploy-web.sh"
  exit 1
fi

# ---------------------------------------------------------------------------
# 1) Backend publico en .env (con copia de seguridad)
# ---------------------------------------------------------------------------
if [ ! -f .env ]; then
  echo "ERROR: falta .env (no se sube a git). Copia .env.example y pon las claves."
  exit 1
fi

if ! grep -q '^EXPO_PUBLIC_SUPABASE_URL=' .env; then
  echo "ERROR: .env no tiene EXPO_PUBLIC_SUPABASE_URL."
  exit 1
fi

ACTUAL="$(grep '^EXPO_PUBLIC_SUPABASE_URL=' .env | head -1 | cut -d= -f2-)"
if [ "$ACTUAL" = "$API_URL" ]; then
  echo "=== El .env ya apunta a $API_URL (no se toca) ==="
else
  echo "=== Actualizando .env: $ACTUAL  ->  $API_URL ==="
  cp .env ".env.bak-$FECHA"
  # sed en un temporal: si se corta a medias no deja el .env roto.
  sed "s|^EXPO_PUBLIC_SUPABASE_URL=.*|EXPO_PUBLIC_SUPABASE_URL=$API_URL|" .env > .env.nuevo
  mv .env.nuevo .env
  echo "    copia de seguridad del .env anterior: .env.bak-$FECHA"
fi

# ---------------------------------------------------------------------------
# 2) Compilar
# ---------------------------------------------------------------------------
if [ "${SALTAR_BUILD:-0}" = "1" ]; then
  echo "=== SALTAR_BUILD=1: no se compila, se usa el web-build actual ==="
  [ -d web-build ] || { echo "ERROR: no hay web-build que copiar."; exit 1; }
else
  echo "=== Compilando (npm run build:web) — puede tardar varios minutos ==="
  rm -rf web-build
  npm run build:web
fi

# ---------------------------------------------------------------------------
# 3) Verificar el build ANTES de publicarlo
# ---------------------------------------------------------------------------
MAIN="$(ls web-build/static/js/main.*.js 2>/dev/null | grep -v '\.map$' | head -1 || true)"
if [ -z "$MAIN" ]; then
  echo "ERROR: el build no tiene web-build/static/js/main.*.js."
  exit 1
fi

if grep -q -F '(process,' "$MAIN"; then
  echo "ERROR: el bundle trae referencias a 'process' (pantalla blanca). No se publica."
  exit 1
fi

if ! grep -q -F "$API_URL" "$MAIN"; then
  echo "ERROR: el bundle NO lleva incrustada la direccion $API_URL."
  echo "Suele ser que el .env se leyo antes de escribirlo: borra web-build y recompila."
  exit 1
fi

echo "=== Build verificado: $(basename "$MAIN") ($(stat -c %s "$MAIN") bytes) ==="

if [ -f scripts/verificar_build.py ]; then
  echo "=== Verificador del proyecto (scripts/verificar_build.py) ==="
  python3 scripts/verificar_build.py web-build | tail -4 || true
elif [ -f /opt/data/tmp/verificar_build.py ]; then
  echo "=== Verificador del proyecto (/opt/data/tmp/verificar_build.py) ==="
  echo "    (ojo: su comprobación de la URL es un heurístico —busca la primera direccion"
  echo "     con puerto y en este bundle aparece antes una de una libreria—; la comprobación"
  echo "     exacta es la de arriba, la de $API_URL)"
  python3 /opt/data/tmp/verificar_build.py web-build | tail -4 || true
else
  echo "=== Verificador del proyecto: no está en este árbol (se salta) ==="
  echo "    Los controles que importan ya pasaron arriba: sin (process, y con $API_URL incrustada."
fi

# ---------------------------------------------------------------------------
# 4) Copiar a la carpeta que sirve nginx (con respaldo de la anterior)
# ---------------------------------------------------------------------------
echo "=== Copiando a $DESTINO ==="
RESPALDO=""
if [ -d "$DESTINO" ]; then
  RESPALDO="${DESTINO}.bak-$FECHA"
  echo "    respaldo de la version que estaba publicada: $RESPALDO"
  cp -r "$DESTINO" "$RESPALDO"
  rm -rf "$DESTINO"
else
  echo "    (no habia nada publicado en esa carpeta: no hay respaldo que guardar)"
fi
mkdir -p "$DESTINO"
# Se copia el contenido tal cual, salvo un .env que pudiera quedar dentro: no tiene nada
# que hacer en la raiz publica del sitio.
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete --exclude='.env' --exclude='.env.*' web-build/ "$DESTINO/"
else
  cp -r web-build/. "$DESTINO/"
  rm -f "$DESTINO"/.env "$DESTINO"/.env.* 2>/dev/null || true
fi

# nginx lee del disco: no hace falta recargarlo. Solo se comprueba.
echo "=== Comprobando lo que sirve el dominio ==="
HASH_LOCAL="$(sha256sum "$MAIN" | cut -d' ' -f1)"
SERVIDO="$(curl -s "$API_URL/" | grep -o 'main\.[0-9a-f]*\.js' | head -1 || true)"
echo "    bundle local:    $(basename "$MAIN")  sha256 ${HASH_LOCAL:0:16}…"
echo "    bundle servido:  ${SERVIDO:-no se pudo leer}"

if [ -n "$SERVIDO" ] && ! cmp -s <(curl -s "$API_URL/static/js/$SERVIDO") "$MAIN"; then
  echo "    AVISO: el dominio aun sirve el archivo anterior (puede ser cache del navegador)."
  echo "           Abre $API_URL con Ctrl+F5 y comprueba; si sigue, revisa la raiz de nginx."
fi

echo
echo "=== Listo ==="
echo "App:      $API_URL"
if [ -n "$RESPALDO" ]; then
  echo "Respaldo: $RESPALDO (la version anterior; borralo cuando compruebes)"
fi
echo "Ojo: el mismo build queda servido por el canal de revision :19006, que ahora apunta"
echo "     al backend del dominio. Para volver a la direccion por IP: API_URL=http://2.25.124.107:8000 sudo -E bash deploy-web.sh"
