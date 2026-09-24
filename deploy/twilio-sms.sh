#!/usr/bin/env bash
#
# Enciende el envio de SMS (codigo de 6 digitos) del Supabase Auth de WhatsRemisse,
# usando Twilio como proveedor. Lo que hace, en orden:
#
#   1. Pide los tres datos de Twilio (Account SID, Auth Token y Messaging Service SID).
#      El Auth Token NO se ve mientras se escribe y NO queda en el historial del terminal.
#   2. Hace copia de seguridad de .env y docker-compose.yml con la fecha en el nombre.
#   3. Escribe/actualiza en .env: SMS_PROVIDER, las tres credenciales, la duracion del
#      codigo (300 s = 5 min; el valor por defecto de 60 s es demasiado corto), 6 digitos,
#      un envio por minuto al mismo numero, el texto del mensaje y el tope de envios.
#   4. Descomenta las lineas GOTRUE_SMS_* del servicio auth en docker-compose.yml.
#      Si despues de descomentar falta alguna, NO deja nada a medias: restaura los dos
#      archivos desde la copia y termina con error (asi no queda el auth roto).
#   5. Recrea SOLO el contenedor auth (run.sh recreate auth) y comprueba que GoTrue
#      arranco con Twilio cargado. El Auth Token sale enmascarado en la verificacion.
#
# Uso:
#   sudo bash deploy/twilio-sms.sh                 # stack por defecto
#   sudo bash deploy/twilio-sms.sh --dir /ruta/al/stack
#   sudo bash deploy/twilio-sms.sh --prueba        # anade SMS_TEST_OTP para probar sin gastar
#   bash deploy/twilio-sms.sh --solo-archivos --dir /tmp/x   # solo edita archivos (pruebas)
#
# Idempotente: se puede volver a correr y no duplica nada.
# Rollback: copiar los dos archivos .bak-<fecha> encima de los actuales y recrear auth.
#
set -euo pipefail

DIR=/opt/supabase-docker/docker
SOLO_ARCHIVOS=0
PRUEBA=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR="${2:-}"; shift 2 ;;
    --solo-archivos) SOLO_ARCHIVOS=1; shift ;;
    --prueba) PRUEBA=1; shift ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "Opcion no reconocida: $1"; exit 2 ;;
  esac
done

ENV="$DIR/.env"
COMPOSE="$DIR/docker-compose.yml"

[ -f "$ENV" ] || { echo "ERROR: no existe $ENV  (usa --dir con la carpeta del stack)"; exit 1; }
[ -f "$COMPOSE" ] || { echo "ERROR: no existe $COMPOSE"; exit 1; }

# ------------------------------------------------ 1) los tres datos de Twilio
CUENTA="${ACCOUNT_SID:-}"
CLAVE="${AUTH_TOKEN:-}"
SERVICIO="${MSG_SERVICE_SID:-}"

echo "Stack: $DIR"
echo "Deja en blanco lo que no tengas a mano (se puede volver a correr)."
# Mientras se piden los datos, Ctrl+C no cambia nada: se avisa (23-09-2026: el usuario pego
# el Auth Token, no vio nada en pantalla, creyo que no habia funcionado y se corto con Ctrl+C).
trap 'echo; echo "Cancelado: no se toco ningun archivo ni ningun contenedor."; exit 130' INT
[ -n "$CUENTA" ] || read -r -p "Account SID  (AC...): " CUENTA || {
  echo "Se cerro la entrada y no hay Account SID: no se toco ningun archivo."; exit 1;
}

# El Auth Token es INVISIBLE a proposito (`read -s`): asi no queda en el historial del terminal
# ni a la vista. Pero eso mismo hizo que el 23-09-2026 el usuario creyera que el pegado habia
# fallado: se pega, no aparece NADA, y hay que pulsar Enter. De ahi el aviso y los 3 intentos.
if [ -z "$CLAVE" ]; then
  echo
  echo "Auth Token: pegalo con Ctrl+Shift+V (o clic derecho -> Pegar)."
  echo "            No se ve NADA mientras pegas: es normal. Luego pulsa Enter."
  intentos=0
  while [ "${#CLAVE}" -lt 20 ] && [ "$intentos" -lt 3 ]; do
    intentos=$((intentos + 1))
    read -r -s -p "Auth Token   (no se vera): " CLAVE || CLAVE=""
    echo
    if [ "${#CLAVE}" -lt 20 ]; then
      echo "   -> llegaron ${#CLAVE} caracteres y el token tiene unos 32."
      echo "      Esta en Twilio: Console -> Account -> API keys & tokens -> Auth Token."
      [ "$intentos" -lt 3 ] && echo "      Intento $intentos de 3."
    fi
  done
  if [ "${#CLAVE}" -lt 20 ]; then
    echo "Sin el Auth Token no se puede encender el SMS. No se toco ningun archivo."
    exit 1
  fi
fi

[ -n "$SERVICIO" ] || read -r -p "Messaging Service SID (MG...): " SERVICIO || {
  echo "Se cerro la entrada y no hay Messaging Service SID: no se toco ningun archivo."; exit 1;
}

case "$CUENTA" in
  AC*) : ;;
  *) echo "ERROR: el Account SID empieza por AC (se pego: ${CUENTA:0:4}...)"; exit 1 ;;
esac
case "$SERVICIO" in
  MG*) : ;;
  *) echo "ERROR: el Messaging Service SID empieza por MG (se pego: ${SERVICIO:0:4}...)"; exit 1 ;;
esac
[ "${#CLAVE}" -ge 20 ] || { echo "ERROR: el Auth Token parece incompleto (${#CLAVE} caracteres)"; exit 1; }
for par in "cuenta:$CUENTA" "token:$CLAVE" "servicio:$SERVICIO"; do
  valor="${par#*:}"
  case "$valor" in
    *[!A-Za-z0-9_-]*) echo "ERROR: el dato de ${par%%:*} trae un caracter raro (¿se pego con espacios?)"; exit 1 ;;
  esac
done

# ------------------------------------------------ 2) copia de seguridad
SELLO="$(date +%Y%m%d-%H%M%S)"
cp -a "$ENV" "$ENV.bak-$SELLO"
cp -a "$COMPOSE" "$COMPOSE.bak-$SELLO"
echo "Copias: $ENV.bak-$SELLO"
echo "        $COMPOSE.bak-$SELLO"

# A partir de aqui SI hay cambios en disco: si se corta, el aviso dice la verdad y da el rollback.
trap "echo; echo 'Cancelado: los archivos YA estan escritos (hay copia de seguridad).'; echo 'Para volver atras:'; echo \"  cp $ENV.bak-$SELLO $ENV\"; echo \"  cp $COMPOSE.bak-$SELLO $COMPOSE\"; echo '  y recrear: cd $DIR && bash run.sh recreate auth'; exit 130" INT

poner_var() { # clave valor  (en .env: reemplaza la linea, este o no comentada)
  local clave="$1" valor="$2"
  if grep -qE "^#?[[:space:]]*${clave}=" "$ENV"; then
    sed -i "s|^#\?[[:space:]]*${clave}=.*|${clave}=${valor}|" "$ENV"
  else
    printf '%s=%s\n' "$clave" "$valor" >> "$ENV"
  fi
}

# ------------------------------------------------ 3) .env
poner_var SMS_PROVIDER twilio
poner_var SMS_TWILIO_ACCOUNT_SID "$CUENTA"
poner_var SMS_TWILIO_AUTH_TOKEN "$CLAVE"
poner_var SMS_TWILIO_MESSAGE_SERVICE_SID "$SERVICIO"
poner_var SMS_OTP_EXP 300
poner_var SMS_OTP_LENGTH 6
poner_var SMS_MAX_FREQUENCY 60s
poner_var SMS_TEMPLATE "WhatsRemisse: tu codigo es {{ .Code }}"
if [ "$PRUEBA" = "1" ]; then
  # Para la prueba: el 999888777 entra con el codigo fijo 123456 y no gasta SMS.
  poner_var SMS_TEST_OTP "51998888777:123456"
fi

# ------------------------------------------------ 4) docker-compose.yml
# Descomenta cualquier linea "# GOTRUE_SMS_ALGO:" del bloque auth, respetando la indentacion.
sed -i -E 's|^([[:space:]]*)#[[:space:]]*(GOTRUE_SMS_[A-Z_]+):|\1\2:|' "$COMPOSE"

FALTAN=""
for var in GOTRUE_SMS_PROVIDER GOTRUE_SMS_OTP_EXP GOTRUE_SMS_OTP_LENGTH \
           GOTRUE_SMS_MAX_FREQUENCY GOTRUE_SMS_TEMPLATE \
           GOTRUE_SMS_TWILIO_ACCOUNT_SID GOTRUE_SMS_TWILIO_AUTH_TOKEN \
           GOTRUE_SMS_TWILIO_MESSAGE_SERVICE_SID; do
  grep -qE "^[[:space:]]*${var}:" "$COMPOSE" || FALTAN="$FALTAN $var"
done

if [ -n "$FALTAN" ]; then
  echo "ERROR: estas variables no existen en docker-compose.yml:$FALTAN"
  echo "Se restauran los dos archivos y NO se toca ningun contenedor."
  cp -a "$ENV.bak-$SELLO" "$ENV"
  cp -a "$COMPOSE.bak-$SELLO" "$COMPOSE"
  echo "Para continuar, agrega a mano en el bloque 'auth' del compose, con la misma"
  echo "indentacion que las demas, las lineas que faltan del estilo:"
  echo "      GOTRUE_SMS_TWILIO_ACCOUNT_SID: \${SMS_TWILIO_ACCOUNT_SID}"
  exit 1
fi

echo "--- .env (queda asi, sin el token) ---"
grep -E "^SMS_" "$ENV" | sed -E 's/(SMS_TWILIO_AUTH_TOKEN=).*/\1***/'
echo "--- docker-compose.yml ---"
grep -nE "^[[:space:]]*GOTRUE_SMS_" "$COMPOSE"

if [ "$SOLO_ARCHIVOS" = "1" ]; then
  echo "Solo archivos (--solo-archivos): no se recrea ningun contenedor."
  exit 0
fi

# ------------------------------------------------ 5) recrear auth y verificar
cd "$DIR"
if [ -f run.sh ]; then
  echo "Recreando el contenedor auth (run.sh recreate auth)..."
  bash run.sh recreate auth
else
  echo "Recreando el contenedor auth (docker compose up -d --force-recreate auth)..."
  docker compose -f docker-compose.yml up -d --force-recreate auth
fi

sleep 6
CONT="$(docker ps --format '{{.Names}} {{.Image}}' | grep -i gotrue | awk '{print $1}' | head -1)"
if [ -z "$CONT" ]; then
  CONT="$(docker ps --format '{{.Names}}' | grep -i 'auth' | head -1)"
fi
if [ -z "$CONT" ]; then
  echo "ATENCION: no encuentro el contenedor de auth para verificar. Revisa: docker ps"
  exit 1
fi

echo "--- estado ---"
docker ps --filter "name=$CONT" --format '{{.Names}}  {{.Status}}'
echo "--- GoTrue con estas variables cargadas (token enmascarado) ---"
docker exec "$CONT" printenv \
  | grep -E "GOTRUE_SMS_|GOTRUE_EXTERNAL_PHONE_ENABLED" \
  | sort \
  | sed -E 's/(AUTH_TOKEN=).*/\1***/'

echo
echo "LISTO. El codigo por SMS ya esta encendido en el servidor."
echo "La app TODAVIA no lo pide: eso es el paso siguiente, con la bandera"
echo "EXPO_PUBLIC_REQUIRE_SMS_VERIFICATION=true y otro despliegue."
echo "Rollback si algo va mal:"
echo "  cp $ENV.bak-$SELLO $ENV && cp $COMPOSE.bak-$SELLO $COMPOSE"
echo "  cd $DIR && bash run.sh recreate auth"
