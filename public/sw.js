/**
 * Service worker de TSM.
 *
 * Hace dos cosas y ninguna más: habilita que la app se instale en el celular, y —cuando se
 * conecte el aviso de viaje cerrado— recibe las notificaciones.
 *
 * NO cachea la app. Es a propósito: un chofer con una versión vieja guardada en el celular es
 * peor que un chofer sin app. Acá se corrigen cosas seguido y todas tienen que llegarle en
 * el próximo arranque, no cuando al navegador se le ocurra.
 *
 * LA ÚNICA EXCEPCIÓN: la página "sin señal" (/sin-senal.html), que se guarda sola y se muestra cuando una
 * NAVEGACIÓN falla porque no hay red. Sin ella Chrome mostraba su ERR_FAILED, que asusta y no dice qué
 * hacer. No es la app ni la API ni los assets: es un HTML suelto, sin JS, que no depende de ninguna versión.
 */

const VERSION = "tsm-2";
const SIN_SENAL = "/sin-senal.html";

/**
 * Guarda la página "sin señal". Se guarda una COPIA limpia y no la respuesta tal cual: el hosting redirige
 * /sin-senal.html a /sin-senal, y Chrome se niega a mostrar en una navegación una respuesta que viene de
 * una redirección (daba el mismo ERR_FAILED que se quería evitar).
 */
async function guardarSinSenal() {
  const res = await fetch(SIN_SENAL, { cache: "reload" });
  if (!res.ok) return;
  const limpia = new Response(await res.blob(), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  await (await caches.open(VERSION)).put(SIN_SENAL, limpia);
}

self.addEventListener("install", (event) => {
  // Sin espera: la versión nueva reemplaza a la vieja apenas se descarga.
  self.skipWaiting();
  // Si no se puede guardar ahora (instalando con mala señal), no se traba la instalación: se reintenta
  // en el próximo arranque del service worker.
  event.waitUntil(guardarSinSenal().catch(() => {}));
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
 *
 * Sólo si una NAVEGACIÓN no puede ni llegar (el fetch se rechaza: sin señal) se muestra la página "sin
 * señal". Una respuesta con error —un 404, un 500— NO es eso: se devuelve tal cual, igual que antes.
 */
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const respuesta = fetch(event.request);
  // Con red, y por si la instalación no pudo guardarla, se asegura de tener la página "sin señal" a mano.
  if (event.request.mode === "navigate") {
    event.waitUntil(
      (async () => {
        if (await caches.match(SIN_SENAL)) return;
        await guardarSinSenal();
      })().catch(() => {}),
    );
  }
  event.respondWith(
    event.request.mode === "navigate"
      ? respuesta.catch(async () => (await caches.match(SIN_SENAL)) || Response.error())
      : respuesta,
  );
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
