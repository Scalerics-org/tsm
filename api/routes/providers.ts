import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES } from "../../shared/domain";
import * as repo from "../repos/providers";

const providers = new Hono<{ Bindings: Env; Variables: Vars }>();
providers.use("*", requireAuth);

providers.get("/", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) =>
  ok(c, await repo.listProviders(c.env.DB)),
);

providers.post("/", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { name?: string };
  if (!b.name) return fail(c, "El nombre es obligatorio", 400);
  const id = await repo.createProvider(c.env.DB, b.name.trim());
  return ok(c, { id }, 201);
});

providers.put("/:id", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { name?: string };
  if (!b.name) return fail(c, "El nombre es obligatorio", 400);
  await repo.updateProvider(c.env.DB, Number(c.req.param("id")), b.name.trim());
  return ok(c, { updated: true });
});

providers.delete("/:id", requireRole(ROLES.ADMIN), async (c) => {
  await repo.deleteProvider(c.env.DB, Number(c.req.param("id")));
  return ok(c, { deleted: true });
});

export default providers;
