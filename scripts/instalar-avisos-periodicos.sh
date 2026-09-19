#!/bin/bash
# Deja el envío de avisos corriendo cada minuto.
#
# POR QUÉ ES UN ARCHIVO Y NO UNA LÍNEA PARA PEGAR: pegar la línea del `crontab` en el terminal se
# deforma (se cuelan los caracteres del borde de la ventana y el `crontab` la rechaza: «bad
# minute»). Así el usuario solo escribe un comando corto.
#
# Es IDEMPOTENTE: si ya estaba, la reemplaza en vez de duplicarla.
#
# Uso:  cd /opt/data/whatsremisse/frontend && bash scripts/instalar-avisos-periodicos.sh
set -euo pipefail

DIRECTORIO="${1:-/opt/data/whatsremisse/frontend}"
LINEA="* * * * * cd ${DIRECTORIO} && node scripts/enviar-avisos.mjs >> /tmp/avisos.log 2>&1"

ACTUAL="$(crontab -l 2>/dev/null || true)"
# Se quita cualquier versión anterior de esta tarea (nunca dos a la vez) y se añade la actual.
SIN_VIEJAS="$(printf '%s\n' "$ACTUAL" | grep -v 'enviar-avisos.mjs' || true)"
printf '%s\n%s\n' "$SIN_VIEJAS" "$LINEA" | grep -v '^[[:space:]]*$' | crontab -

echo "=== tareas programadas de este usuario ==="
crontab -l
echo
echo "Los avisos se revisan cada minuto. El registro queda en /tmp/avisos.log"
echo "Para verlo:  tail -20 /tmp/avisos.log"
