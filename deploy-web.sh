#!/bin/bash
# Despliegue completo de WhatsRemisse web en el VPS
# Ejecutar como root o con sudo en el VPS
set -e

cd /opt/data/whatsremisse/frontend

# Si hay remote configurado, actualiza el codigo
if git remote get-url origin >/dev/null 2>&1; then
  echo "=== Actualizando codigo desde Git ==="
  git pull origin main
else
  echo "=== Sin remote de Git configurado. Usando codigo local. ==="
fi

echo "=== Instalando dependencias ==="
npm install

echo "=== Compilando build web ==="
rm -rf web-build
npx expo export:web

echo "=== Verificando que el build no tenga strings dummy ==="
if grep -R -E "Código demo|modo demo|driver-1|provider-1|Mister Remisse|Remisse Lima|CarVips|999 888 777|Grupo de prueba" web-build/static/js/*.js >/dev/null 2>&1; then
  echo "ERROR: El build contiene strings dummy. Abortando despliegue."
  exit 1
fi

REMOTE_DIR="/var/www/whatsremisse"
BUILD_DIR="/opt/data/whatsremisse/frontend/web-build"
NGINX_CONF="/opt/data/whatsremisse/frontend/nginx.conf"

echo "=== Creando directorio de despliegue ==="
mkdir -p "$REMOTE_DIR"

echo "=== Copiando build ==="
rm -rf "$REMOTE_DIR/web-build"
cp -r "$BUILD_DIR" "$REMOTE_DIR/web-build"

echo "=== Instalando configuracion nginx ==="
cp "$NGINX_CONF" /etc/nginx/sites-available/whatsremisse

if [ ! -e /etc/nginx/sites-enabled/whatsremisse ]; then
    ln -s /etc/nginx/sites-available/whatsremisse /etc/nginx/sites-enabled/whatsremisse
fi

echo "=== Probando configuracion nginx ==="
nginx -t

echo "=== Recargando nginx ==="
systemctl reload nginx

echo "=== Despliegue completo ==="
echo "WhatsRemisse web deberia estar disponible en http://2.25.124.107"
