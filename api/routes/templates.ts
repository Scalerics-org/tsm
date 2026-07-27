import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES, EXTRA_TYPE, type ExtraType } from "../../shared/domain";
import * as repo from "../repos/templates";

const templates = new Hono<{ Bindings: Env; Variables: Vars }>();
templates.use("*", requireAuth);

// Choferes ven las plantillas activas (para elegir viaje); oficina ve todas.
templates.get("/", async (c) => {
  const user = c.get("user");
  const onlyActive = user.role === ROLES.CHOFER;
  return ok(c, await repo.listTemplates(c.env.DB, onlyActive));
});

const VALID_EXTRA: ExtraType[] = [EXTRA_TYPE.NONE, EXTRA_TYPE.TEXTO, EXTRA_TYPE.NUMERO];

function parse(b: any): repo.TemplateInput | null {
  if (!b || !b.provider_id || !b.name || !b.origin) return null;
  const destinations = Array.isArray(b.destinations)
    ? b.destinations.map((d: unknown) => String(d)).filter(Boolean)
    : [];
  const extra_type: ExtraType = VALID_EXTRA.includes(b.extra_type) ? b.extra_type : EXTRA_TYPE.NONE;
  return {
    provider_id: Number(b.provider_id),
    name: String(b.name),
    origin: String(b.origin),
    destinations,
    cargo_type: String(b.cargo_type ?? ""),
    requires_kilos: !!b.requires_kilos,
    extra_label: extra_type !== EXTRA_TYPE.NONE ? String(b.extra_label ?? "").trim() || null : null,
    extra_type,
    extra_required: !!b.extra_required,
    active: b.active === undefined ? true : !!b.active,
  };
}

templates.post("/", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  const input = parse(await c.req.json().catch(() => null));
  if (!input) return fail(c, "Faltan campos (proveedor, nombre, origen)", 400);
  const id = await repo.createTemplate(c.env.DB, input);
  return ok(c, await repo.getTemplate(c.env.DB, id), 201);
});

templates.put("/:id", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  const input = parse(await c.req.json().catch(() => null));
  if (!input) return fail(c, "Faltan campos (proveedor, nombre, origen)", 400);
  const id = Number(c.req.param("id"));
  await repo.updateTemplate(c.env.DB, id, input);
  return ok(c, await repo.getTemplate(c.env.DB, id));
});

templates.delete("/:id", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  await repo.deleteTemplate(c.env.DB, Number(c.req.param("id")));
  return ok(c, { deleted: true });
});

export default templates;
