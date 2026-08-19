/**
 * Service worker de TSM.
 *
 * Hace dos cosas y ninguna más: habilita que la app se instale en el celular, y —cuando se
 * conecte el aviso de viaje cerrado— recibe las notificaciones.
 *
 * NO cachea nada. Es a propósito: un chofer con una versión vieja guardada en el celular es
 * peor que un chofer sin app. Acá se corrigen cosas seguido y todas tienen que llegarle en
 * el próximo arranque, no cuando al navegador se le ocurra. Si algún día hace falta que
 * funcione sin señal, se agrega con cuidado y para pantallas puntuales — no para todo.
 */

const VERSION = "tsm-1";

self.addEventListener("install", () => {
  // Sin espera: la versión nueva reemplaza a la vieja apenas se descarga.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Por si alguna versión anterior llegó a dejar cachés dando vueltas.
      const nombres = await caches.keys();
      await Promise.all(nombres.filter((n) => n !== VERSION).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

/**
 * Todo va a la red, tal cual. El handler existe porque el navegador lo pide para considerar
 * la app instalable — no para meterse en el medio de los pedidos.
 */
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request));
});

/** Aviso de viaje cerrado. El servidor manda { title, body, url }. */
self.addEventListener("push", (event) => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch {
    datos = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(datos.title || "TSM", {
      body: datos.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // Un aviso por viaje: si llegan varios juntos, no se pisan entre ellos.
      tag: datos.tag || undefined,
      data: { url: datos.url || "/" },
    }),
  );
});

/** Al tocar el aviso, abre la app en el viaje — o la trae al frente si ya estaba abierta. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const abiertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of abiertas) {
        if ("focus" in c) {
          await c.focus();
          if ("navigate" in c) await c.navigate(destino);
          return;
        }
      }
      await self.clients.openWindow(destino);
    })(),
  );
});
