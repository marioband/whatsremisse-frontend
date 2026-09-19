/**
 * Manda los avisos al teléfono (Web Push).
 *
 * Por qué existe: en el iPhone la app es una PWA y las notificaciones no pueden salir del
 * `expo-notifications` de las apps de tienda. Aquí se firma el aviso con la clave VAPID y se envía
 * a la dirección que dio el navegador (en el iPhone, la de Apple).
 *
 * Quién la llama: los disparadores de la base (migración 0029) con `pg_net`, cuando
 *   - entra un mensaje en el chat de un grupo,
 *   - entra un mensaje en el chat de un servicio,
 *   - se publica una alerta de servicio,
 *   - el conductor reporta un hito del viaje.
 *
 * Secretos que necesita (se ponen con `supabase secrets set`, NUNCA en el repositorio):
 *   VAPID_PUBLICA, VAPID_PRIVADA  -> las claves del proyecto (una sola pareja para todos)
 *   AVISOS_CONTACTO               -> un mail de contacto que exige el protocolo (puede ser el tuyo)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY -> los pone Supabase solos
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

interface Peticion {
  /** A quién avisar (ids de usuario). */
  destinatarios: string[];
  titulo: string;
  cuerpo: string;
  /** A dónde lleva el toque (una ruta de la app, por ejemplo /#/chat/servicio/<id>). */
  url?: string;
  /** Si dos avisos comparten etiqueta, el segundo reemplaza al primero (útil en un chat). */
  etiqueta?: string;
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const VAPID_PUBLICA = Deno.env.get('VAPID_PUBLICA') ?? '';
const VAPID_PRIVADA = Deno.env.get('VAPID_PRIVADA') ?? '';
const CONTACTO = Deno.env.get('AVISOS_CONTACTO') ?? 'mailto:soporte@whatsremisse.tech';

if (VAPID_PUBLICA && VAPID_PRIVADA) {
  webpush.setVapidDetails(CONTACTO, VAPID_PUBLICA, VAPID_PRIVADA);
}

Deno.serve(async (peticion) => {
  if (!VAPID_PUBLICA || !VAPID_PRIVADA) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Faltan las claves VAPID en los secretos de la función.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let datos: Peticion;
  try {
    datos = await peticion.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Cuerpo inválido' }), { status: 400 });
  }

  const destinatarios = (datos.destinatarios ?? []).filter(Boolean);
  if (destinatarios.length === 0) {
    return new Response(JSON.stringify({ ok: true, enviados: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: suscripciones, error } = await supabase
    .from('push_web')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', destinatarios);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
  }

  const aviso = JSON.stringify({
    titulo: datos.titulo,
    cuerpo: datos.cuerpo,
    url: datos.url ?? '/',
    etiqueta: datos.etiqueta,
  });

  let enviados = 0;
  const vencidas: string[] = [];

  await Promise.all(
    (suscripciones ?? []).map(async (fila) => {
      try {
        await webpush.sendNotification(
          { endpoint: fila.endpoint, keys: { p256dh: fila.p256dh, auth: fila.auth } },
          aviso
        );
        enviados += 1;
      } catch (fallo) {
        // 404/410 = esa dirección ya no existe (app desinstalada o permiso retirado): se borra
        // para no intentarlo en cada aviso.
        const codigo = (fallo as { statusCode?: number }).statusCode;
        if (codigo === 404 || codigo === 410) vencidas.push(fila.id);
      }
    })
  );

  if (vencidas.length > 0) {
    await supabase.from('push_web').delete().in('id', vencidas);
  }

  return new Response(JSON.stringify({ ok: true, enviados, borradas: vencidas.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
