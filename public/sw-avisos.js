/**
 * El único service worker de la app: SOLO recibe avisos. No cachea NADA.
 *
 * Por qué está aquí y por qué es tan corto: en el iPhone las notificaciones de una app web
 * (PWA) solo existen si hay un service worker que atienda el evento `push`, y ese archivo lo
 * exige iOS. El usuario prohibió un service worker que guardara cosas (uno mal cacheado
 * devolvería JavaScript viejo), así que este NO tiene ningún manejador de `fetch` ni caché:
 * no puede devolver nada viejo porque no guarda nada.
 *
 * Lo que hace:
 *   - `push`: pinta el aviso con lo que mandó el servidor.
 *   - `notificationclick`: abre (o trae al frente) la app en la conversación del aviso.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (evento) => evento.waitUntil(self.clients.claim()));

self.addEventListener('push', (evento) => {
  let datos = {};
  try {
    datos = evento.data ? evento.data.json() : {};
  } catch (e) {
    datos = { cuerpo: evento.data ? evento.data.text() : '' };
  }

  const titulo = datos.titulo || 'WhatsRemisse';
  const opciones = {
    body: datos.cuerpo || 'Tienes un aviso nuevo.',
    icon: '/pwa/icons/icon-192.png',
    badge: '/pwa/icons/icon-192.png',
    // El aviso lleva su destino para que el toque abra la conversación correcta.
    data: { url: datos.url || '/' },
    tag: datos.etiqueta || undefined,
    renotify: Boolean(datos.etiqueta),
  };

  evento.waitUntil(self.registration.showNotification(titulo, opciones));
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = (evento.notification.data && evento.notification.data.url) || '/';

  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      // Si la app ya está abierta, se trae al frente y se navega; si no, se abre.
      for (const ventana of ventanas) {
        if ('focus' in ventana) {
          ventana.navigate(destino).catch(() => undefined);
          return ventana.focus();
        }
      }
      return self.clients.openWindow(destino);
    })
  );
});
