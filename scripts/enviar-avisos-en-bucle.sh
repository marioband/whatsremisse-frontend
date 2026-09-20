#!/bin/bash
# Envía los avisos pendientes en bucle, con 5 segundos de pausa entre vueltas.
#
# POR QUÉ: antes esto lo hacía el cron, que pasa UNA vez por minuto. Si el aviso entraba justo
# después de la ronda, esperaba de pie hasta 60 segundos — de ahí la sensación de lentitud que
# reportó el usuario el 19-09-2026 («las notificaciones tardan mucho, lo ideal es que sean al
# momento»). Aquí el mensajero no se va a la oficina: se queda en la puerta.
#
# Lo instala `deploy/whatsremisse-avisos.service` (systemd lo reinicia solo si el proceso muere).
# El script de envío en sí es `scripts/enviar-avisos.mjs`, el mismo de antes: aquí solo se repite.
cd /opt/data/whatsremisse/frontend || exit 1
while true; do
  node scripts/enviar-avisos.mjs >> /var/log/whatsremisse-avisos.log 2>&1 || true
  sleep 5
done
