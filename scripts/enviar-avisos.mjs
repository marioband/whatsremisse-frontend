#!/usr/bin/env node
/**
 * Manda los avisos apuntados en la cola (`avisos_cola`) al teléfono.
 *
 * Por qué así y no con una función de Supabase: el servidor del usuario no tiene el CLI de
 * Supabase, y esto hace lo mismo sin instalar nada nuevo — una vuelta de este programa cada
 * minuto. La base solo APUNTA los avisos (rápido y sin poder fallar por la red); aquí se firman
 * con la clave VAPID y se mandan al navegador (en el iPhone, a Apple).
 *
 * Uso:      node scripts/enviar-avisos.mjs [--limite 50] [--seco]
 * Cada minuto (crontab -e):  * * * * * cd /opt/data/whatsremisse/frontend && node scripts/enviar-avisos.mjs >> /tmp/avisos.log 2>&1
 *
 * Necesita en el `.env` del frontend (ese archivo NO se versiona):
 *   VAPID_PUBLICA, VAPID_PRIVADA, AVISOS_CONTACTO y SUPABASE_SERVICE_ROLE_KEY
 * (la dirección del proyecto se toma de EXPO_PUBLIC_SUPABASE_URL, que ya está ahí).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Lee el `.env` sin depender de la versión de Node. */
function leerEnv() {
  const env = { ...process.env };
  try {
    const texto = readFileSync(join(RAIZ, '.env'), 'utf8');
    for (const linea of texto.split('\n')) {
      const limpia = linea.trim();
      if (!limpia || limpia.startsWith('#')) continue;
      const corte = limpia.indexOf('=');
      if (corte < 1) continue;
      const clave = limpia.slice(0, corte).trim();
      let valor = limpia.slice(corte + 1).trim();
      if (
        (valor.startsWith('"') && valor.endsWith('"')) ||
        (valor.startsWith("'") && valor.endsWith("'"))
      ) {
        valor = valor.slice(1, -1);
      }
      if (!env[clave]) env[clave] = valor;
    }
  } catch {
    // Sin .env se usan las variables del entorno.
  }
  return env;
}

const env = leerEnv();
const URL = env.EXPO_PUBLIC_SUPABASE_URL;
const CLAVE = env.SUPABASE_SERVICE_ROLE_KEY;
const VAPID_PUBLICA = env.VAPID_PUBLICA;
const VAPID_PRIVADA = env.VAPID_PRIVADA;
const CONTACTO = env.AVISOS_CONTACTO || 'mailto:soporte@whatsremisse.tech';

const argumentos = process.argv.slice(2);
const enSeco = argumentos.includes('--seco');
const iLimite = argumentos.indexOf('--limite');
const LIMITE = iLimite >= 0 ? Number(argumentos[iLimite + 1]) || 50 : 50;

function morir(mensaje) {
  console.error('[avisos] ' + mensaje);
  process.exit(1);
}

if (!URL) morir('falta EXPO_PUBLIC_SUPABASE_URL en el .env');
if (!CLAVE) morir('falta SUPABASE_SERVICE_ROLE_KEY en el .env');
if (!VAPID_PUBLICA || !VAPID_PRIVADA) morir('faltan VAPID_PUBLICA / VAPID_PRIVADA en el .env');

const { default: webpush } = await import('web-push').catch(() =>
  morir('falta el paquete web-push: ejecuta `npm install` en el frontend')
);
webpush.setVapidDetails(CONTACTO, VAPID_PUBLICA, VAPID_PRIVADA);

const cabeceras = {
  apikey: CLAVE,
  Authorization: 'Bearer ' + CLAVE,
  'Content-Type': 'application/json',
};

async function pedir(ruta, opciones = {}) {
  const respuesta = await fetch(URL + '/rest/v1/' + ruta, { headers: cabeceras, ...opciones });
  if (!respuesta.ok)
    throw new Error(`HTTP ${respuesta.status} en ${ruta}: ${await respuesta.text()}`);
  const texto = await respuesta.text();
  return texto ? JSON.parse(texto) : null;
}

/** Una vuelta: recoge lo pendiente, manda y marca. */
async function vuelta() {
  const pendientes = await pedir(
    `avisos_cola?enviado_at=is.null&intentos=lt.5&order=id.asc&limit=${LIMITE}&select=*`
  );
  if (!pendientes || pendientes.length === 0) {
    console.log('[avisos] nada pendiente');
    return;
  }

  let enviados = 0;
  let fallados = 0;

  for (const aviso of pendientes) {
    const destinatarios = aviso.destinatarios || [];
    let suscripciones = [];
    try {
      suscripciones = await pedir(
        `push_web?user_id=in.(${destinatarios.join(',')})&select=id,endpoint,p256dh,auth`
      );
    } catch (fallo) {
      console.error('[avisos] no se pudieron leer las suscripciones:', fallo.message);
    }

    const cuerpo = JSON.stringify({
      titulo: aviso.titulo,
      cuerpo: aviso.cuerpo,
      url: aviso.url || '/',
      etiqueta: aviso.etiqueta || undefined,
    });

    const vencidas = [];
    let algunoOk = false;
    for (const fila of suscripciones || []) {
      try {
        if (enSeco) {
          console.log('[avisos] (en seco) se mandaría a', fila.endpoint.slice(0, 40) + '…');
          algunoOk = true;
          continue;
        }
        await webpush.sendNotification(
          { endpoint: fila.endpoint, keys: { p256dh: fila.p256dh, auth: fila.auth } },
          cuerpo
        );
        algunoOk = true;
        enviados += 1;
      } catch (fallo) {
        const codigo = fallo && fallo.statusCode;
        if (codigo === 404 || codigo === 410) {
          vencidas.push(fila.id);
        } else {
          console.error('[avisos] falló el envío:', codigo || '', fallo && fallo.message);
        }
      }
    }

    if (vencidas.length > 0) {
      await pedir(`push_web?id=in.(${vencidas.join(',')})`, { method: 'DELETE' }).catch(
        () => undefined
      );
      console.log('[avisos] suscripciones vencidas borradas:', vencidas.length);
    }

    if (enSeco) continue;

    if (algunoOk || destinatarios.length === 0) {
      await pedir(`avisos_cola?id=eq.${aviso.id}`, {
        method: 'PATCH',
        headers: { ...cabeceras, Prefer: 'return=minimal' },
        body: JSON.stringify({ enviado_at: new Date().toISOString(), ultimo_error: null }),
      });
    } else {
      fallados += 1;
      await pedir(`avisos_cola?id=eq.${aviso.id}`, {
        method: 'PATCH',
        headers: { ...cabeceras, Prefer: 'return=minimal' },
        body: JSON.stringify({
          intentos: (aviso.intentos || 0) + 1,
          ultimo_error: 'No se pudo entregar a ninguna suscripción',
        }),
      }).catch(() => undefined);
    }
  }

  console.log(
    `[avisos] avisos atendidos: ${pendientes.length} · entregas: ${enviados} · sin entregar: ${fallados}`
  );

  // Limpieza: lo entregado hace más de una semana y lo que ya no se puede entregar.
  if (!enSeco) {
    const haceUnaSemana = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await pedir(`avisos_cola?enviado_at=lt.${haceUnaSemana}`, { method: 'DELETE' }).catch(
      () => undefined
    );
    await pedir('avisos_cola?intentos=gte.5', { method: 'DELETE' }).catch(() => undefined);
  }
}

await vuelta().catch((fallo) => morir(fallo.message));
