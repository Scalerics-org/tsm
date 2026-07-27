import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth } from "../middleware/auth";
import { saveSubscription } from "../repos/push";

const push = new Hono<{ Bindings: Env; Variables: Vars }>();
push.use("*", requireAuth);

// Clave pública VAPID para que el frontend se suscriba.
push.get("/vapid", (c) => ok(c, { publicKey: c.env.VAPID_PUBLIC }));

// Guardar (o actualizar) la suscripción del navegador del usuario.
push.post("/subscribe", async (c) => {
  const user = c.get("user");
  const b = (await c.req.json().catch(() => ({}))) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (!b.endpoint || !b.keys?.p256dh || !b.keys?.auth) {
    return fail(c, "Suscripción inválida", 400);
  }
  await saveSubscription(c.env.DB, user.id, {
    endpoint: b.endpoint,
    p256dh: b.keys.p256dh,
    auth: b.keys.auth,
  });
  return ok(c, { subscribed: true });
});

export default push;
