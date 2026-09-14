#!/bin/bash
# Despliegue de WhatsRemisse web en el VPS
# Ejecutar como root o con sudo en el VPS
set -e

REMOTE_DIR="/var/www/whatsremisse"
BUILD_DIR="/opt/data/whatsremisse/frontend/web-build"
NGINX_CONF="/opt/data/whatsremisse/frontend/nginx.conf"

echo "=== Creando directorio de despliegue ==="
mkdir -p "$REMOTE_DIR"

echo "=== Copiando build ==="
rm -rf "$REMOTE_DIR/web-build"
cp -r "$BUILD_DIR" "$REMOTE_DIR/web-build"

echo "=== Instalando configuración nginx ==="
cp "$NGINX_CONF" /etc/nginx/sites-available/whatsremisse

if [ ! -e /etc/nginx/sites-enabled/whatsremisse ]; then
    ln -s /etc/nginx/sites-available/whatsremisse /etc/nginx/sites-enabled/whatsremisse
fi

echo "=== Probando configuración nginx ==="
nginx -t

echo "=== Recargando nginx ==="
systemctl reload nginx

echo "=== Despliegue completo ==="
echo "WhatsRemisse web debería estar disponible en http://2.25.124.107"
