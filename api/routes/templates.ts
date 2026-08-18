import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  ROLES,
  FIELD_STAGE,
  FIELD_TYPE,
  CAMPO_MODO,
  LIBRETA_TIPO,
  TIPO_DEPARTAMENTO,
  plantillaHabilitada,
  UNIDAD,
  type CamposUbicacion,
  type RenglonFijo,
} from "../../shared/domain";
import * as repo from "../repos/templates";

const templates = new Hono<{ Bindings: Env; Variables: Vars }>();
templates.use("*", requireAuth);

// Choferes ven plantillas activas; oficina ve todas.
templates.get("/", async (c) => {
  const user = c.get("user");
  const esChofer = user.role === ROLES.CHOFER;
  const todas = await repo.listTemplates(c.env.DB, esChofer);
  if (!esChofer) return ok(c, todas);

  // Hay camiones que no hacen ciertos trabajos: si la plantilla tiene camiones
  // asignados y el suyo no está, no se la ofrecemos. Sin asignación, la ven todos.
  // El camión puede venir por query (el chofer eligió otro al iniciar el viaje).
  const q = c.req.query("truck");
  const truckId = q ? Number(q) : user.truck_id;
  return ok(c, todas.filter((t) => plantillaHabilitada(t, truckId)));
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

const PARTES = ["origen", "remitente", "destino", "destinatario"] as const;
// "departamento" no es un tipo de libreta pero se elige con el mismo selector: en el
// viaje ocasional la ciudad de carga sale de los 19, no del tipo "lugar" (que son los
// orígenes de los internacionales).
const LIBRETA_TIPOS = [...Object.values(LIBRETA_TIPO), TIPO_DEPARTAMENTO] as string[];

/** Normaliza las partes configurables. Devuelve null si no se configuró ninguna (flujo clásico). */
function parseCamposUbicacion(raw: any): CamposUbicacion | null {
  if (!raw || typeof raw !== "object") return null;
  const out: CamposUbicacion = {};
  for (const parte of PARTES) {
    const c = raw[parte];
    if (!c || typeof c !== "object") continue;
    if (c.modo === CAMPO_MODO.LIBRETA) {
      const tipo = LIBRETA_TIPOS.includes(c.libreta_tipo) ? c.libreta_tipo : LIBRETA_TIPO.LUGAR;
      out[parte] = {
        modo: CAMPO_MODO.LIBRETA,
        label: c.label ? String(c.label).trim() : undefined,
        libreta_tipo: tipo,
        permite_alta: c.permite_alta === undefined ? true : !!c.permite_alta,
        requerido: c.requerido === undefined ? true : !!c.requerido,
      };
    } else if (c.modo === CAMPO_MODO.FIJO) {
      const valor = String(c.valor ?? "").trim();
      if (!valor) continue; // un campo fijo sin valor no aporta nada
      out[parte] = {
        modo: CAMPO_MODO.FIJO,
        label: c.label ? String(c.label).trim() : undefined,
        valor,
        requerido: c.requerido === undefined ? true : !!c.requerido,
      };
    }
  }
  return Object.keys(out).length ? out : null;
}

/** Renglones que la oficina deja precargados (ida y vuelta). */
function parseRenglonesFijos(raw: any): RenglonFijo[] | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const out = raw
    .map((r: any) => ({
      origen: r?.origen ? String(r.origen).trim() : null,
      origen_id: r?.origen_id ? Number(r.origen_id) : null,
      destino: r?.destino ? String(r.destino).trim() : null,
      destino_id: r?.destino_id ? Number(r.destino_id) : null,
      remitente: String(r?.remitente ?? "").trim(),
      remitente_id: r?.remitente_id ? Number(r.remitente_id) : null,
      clientes: Array.isArray(r?.clientes) ? r.clientes.map((c: any) => String(c).trim()).filter(Boolean) : [],
      cliente_ids: Array.isArray(r?.cliente_ids) ? r.cliente_ids.map(Number).filter((n: number) => !isNaN(n)) : [],
      cantidad: r?.cantidad != null && r.cantidad !== "" ? Number(r.cantidad) : null,
      unidad: r?.unidad === UNIDAD.KILOS || r?.unidad === UNIDAD.PALLETS ? r.unidad : null,
      remito: r?.remito ? String(r.remito).trim() : null,
    }))
    .filter((r: RenglonFijo) => r.remitente || r.clientes.length);
  return out.length ? out : null;
}

function parse(b: any): repo.TemplateInput | null {
  if (!b || !b.provider_id || !b.name) return null;
  // El origen puede venir vacío si la plantilla lo resuelve con la libreta: en el viaje
  // ocasional lo elige el chofer. Exigirlo siempre dejaba esa plantilla imposible de guardar.
  const origenPorLibreta = b.campos_ubicacion?.origen != null;
  if (!b.origin && !origenPorLibreta) return null;
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
    origin: String(b.origin ?? ""),
    remite: b.remite ? String(b.remite).trim() : null,
    cargo_type: String(b.cargo_type ?? ""),
    dest_options,
    fields,
    arrival_photo_label: b.arrival_photo_label ? String(b.arrival_photo_label).trim() : null,
    carga_photo_label: b.carga_photo_label ? String(b.carga_photo_label).trim() : null,
    campos_ubicacion: parseCamposUbicacion(b.campos_ubicacion),
    multi_renglon: !!b.multi_renglon,
    renglon_pide_ubicacion: !!b.renglon_pide_ubicacion,
    renglones_fijos: parseRenglonesFijos(b.renglones_fijos),
    pide_kilometros: !!b.pide_kilometros,
    viaje_vacio: !!b.viaje_vacio,
    // Si no viene, se pide la foto — salvo en los vacíos, que no tienen qué fotografiar.
    foto_carga_requerida:
      b.foto_carga_requerida === undefined ? !b.viaje_vacio : !!b.foto_carga_requerida,
    truck_ids: Array.isArray(b.truck_ids) ? b.truck_ids.map(Number).filter((n: number) => !isNaN(n)) : [],
    active: b.active === undefined ? true : !!b.active,
  };
}

templates.post("/", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  const input = parse(await c.req.json().catch(() => null));
  if (!input) return fail(c, "Faltan campos (proveedor, nombre, origen)", 400);
  const id = await repo.createTemplate(c.env.DB, input);
  await repo.setTemplateTrucks(c.env.DB, id, input.truck_ids);
  return ok(c, await repo.getTemplate(c.env.DB, id), 201);
});

templates.put("/:id", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  const input = parse(await c.req.json().catch(() => null));
  if (!input) return fail(c, "Faltan campos (proveedor, nombre, origen)", 400);
  const id = Number(c.req.param("id"));
  await repo.updateTemplate(c.env.DB, id, input);
  await repo.setTemplateTrucks(c.env.DB, id, input.truck_ids);
  return ok(c, await repo.getTemplate(c.env.DB, id));
});

templates.delete("/:id", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  await repo.deleteTemplate(c.env.DB, Number(c.req.param("id")));
  return ok(c, { deleted: true });
});

export default templates;
