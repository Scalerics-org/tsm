import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth } from "../middleware/auth";
import * as repo from "../repos/push";
import { enviarPush } from "../lib/webpush";

const push = new Hono<{ Bindings: Env; Variables: Vars }>();
push.use("*", requireAuth);

/** Sin las claves VAPID cargadas no hay nada que hacer: se avisa en vez de fallar raro. */
function claves(c: { env: Env }) {
  const { VAPID_PUBLIC: publica, VAPID_PRIVATE: privada, VAPID_SUBJECT: subject } = c.env;
  if (!publica || !privada) return null;
  return { publica, privada, subject: subject || "mailto:contacto@scalerics.com" };
}

/**
 * GET /api/push/clave — la clave pública que el navegador necesita para suscribirse.
 *
 * Va por la API y no incrustada en el bundle: si algún día se rota, no hay que volver a
 * compilar el frontend.
 */
push.get("/clave", (c) => {
  const v = claves(c);
  return ok(c, { publica: v?.publica ?? null, activo: !!v });
});

/** GET /api/push/estado — si este usuario ya tiene avisos activados en algún dispositivo. */
push.get("/estado", async (c) => {
  const suyas = await repo.suscripcionesDeUsuario(c.env.DB, c.get("user").id);
  return ok(c, { suscripciones: suyas.length });
});

// POST /api/push/suscribir — el navegador manda su endpoint y sus claves.
push.post("/suscribir", async (c) => {
  const b = (await c.req.json().catch(() => null)) as
    | { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    | null;
  if (!b?.endpoint || !b.keys?.p256dh || !b.keys?.auth) {
    return fail(c, "Faltan los datos de la suscripción", 400);
  }
  await repo.guardarSuscripcion(c.env.DB, c.get("user").id, {
    endpoint: b.endpoint,
    p256dh: b.keys.p256dh,
    auth: b.keys.auth,
  });
  return ok(c, { suscrito: true }, 201);
});

// DELETE /api/push/suscribir — apagar los avisos en este dispositivo.
push.delete("/suscribir", async (c) => {
  const b = (await c.req.json().catch(() => null)) as { endpoint?: string } | null;
  if (!b?.endpoint) return fail(c, "Falta el endpoint", 400);
  await repo.borrarSuscripcion(c.env.DB, b.endpoint);
  return ok(c, { deleted: true });
});

/**
 * POST /api/push/probar — se manda un aviso a sí mismo.
 *
 * Sirve para que quien lo activa confirme en el momento que le llega, en vez de esperar a
 * que un chofer cierre un viaje para descubrir que no funcionaba.
 */
push.post("/probar", async (c) => {
  const v = claves(c);
  if (!v) return fail(c, "Las notificaciones no están configuradas en el servidor", 503);

  const suyas = await repo.suscripcionesDeUsuario(c.env.DB, c.get("user").id);
  if (!suyas.length) return fail(c, "Todavía no activaste los avisos en este dispositivo", 400);

  const resultados = await Promise.all(
    suyas.map((s) =>
      enviarPush(s, { title: "TSM", body: "Los avisos están andando.", url: "/", tag: "prueba" }, v),
    ),
  );
  // Una suscripción vencida se limpia sola: si no, queda intentando contra un celular que
  // ya no existe cada vez que se cierra un viaje.
  await Promise.all(
    resultados.map((r, i) => (r.vencida ? repo.borrarSuscripcion(c.env.DB, suyas[i].endpoint) : null)),
  );

  const enviados = resultados.filter((r) => r.ok).length;
  if (!enviados) {
    const detalle = resultados.map((r) => r.status).join(", ");
    return fail(c, `No se pudo entregar el aviso (respuesta ${detalle})`, 502);
  }
  return ok(c, { enviados, dispositivos: suyas.length });
});

export default push;
