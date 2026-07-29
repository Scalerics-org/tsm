import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES, FIELD_STAGE, FIELD_TYPE } from "../../shared/domain";
import * as repo from "../repos/templates";

const templates = new Hono<{ Bindings: Env; Variables: Vars }>();
templates.use("*", requireAuth);

// Choferes ven plantillas activas; oficina ve todas.
templates.get("/", async (c) => {
  const onlyActive = c.get("user").role === ROLES.CHOFER;
  return ok(c, await repo.listTemplates(c.env.DB, onlyActive));
});

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "campo"
  );
}

function parse(b: any): repo.TemplateInput | null {
  if (!b || !b.provider_id || !b.name || !b.origin) return null;
  const dest_options = Array.isArray(b.dest_options)
    ? b.dest_options
        .map((o: any) => ({ destino: String(o?.destino ?? "").trim(), destinatario: String(o?.destinatario ?? "").trim() }))
        .filter((o: any) => o.destino)
    : [];
  const fields = Array.isArray(b.fields)
    ? b.fields
        .map((f: any) => ({
          key: String(f?.key || slug(String(f?.label ?? ""))),
          label: String(f?.label ?? "").trim(),
          type: f?.type === FIELD_TYPE.NUMERO ? FIELD_TYPE.NUMERO : FIELD_TYPE.TEXTO,
          required: !!f?.required,
          stage: f?.stage === FIELD_STAGE.DESCARGA ? FIELD_STAGE.DESCARGA : FIELD_STAGE.CARGA,
          is_weight: !!f?.is_weight,
        }))
        .filter((f: any) => f.label)
    : [];
  return {
    provider_id: Number(b.provider_id),
    name: String(b.name),
    origin: String(b.origin),
    remite: b.remite ? String(b.remite).trim() : null,
    cargo_type: String(b.cargo_type ?? ""),
    dest_options,
    fields,
    arrival_photo_label: b.arrival_photo_label ? String(b.arrival_photo_label).trim() : null,
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
