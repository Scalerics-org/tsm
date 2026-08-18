import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  COBRO_TIPO,
  LIBRETA_ESTADO,
  LIBRETA_TIPO,
  ROLES,
  type CobroTipo,
  type LibretaTipo,
} from "../../shared/domain";
import * as repo from "../repos/libreta";
import * as tripsRepo from "../repos/trips";

const libreta = new Hono<{ Bindings: Env; Variables: Vars }>();
libreta.use("*", requireAuth);

const TIPOS = Object.values(LIBRETA_TIPO) as string[];
const isTipo = (v: unknown): v is LibretaTipo => typeof v === "string" && TIPOS.includes(v);
const isCobroTipo = (v: unknown): v is CobroTipo =>
  v === COBRO_TIPO.CLIENTE || v === COBRO_TIPO.PROVEEDOR;

// GET /api/libreta?tipo=&provider=&seleccionables=1&estado=
// El chofer la usa para el selector; la oficina para el ABM.
libreta.get("/", async (c) => {
  const q = c.req.query();
  if (q.tipo && !isTipo(q.tipo)) return fail(c, "Tipo de entrada inválido", 400);
  return ok(
    c,
    await repo.listLibreta(c.env.DB, {
      tipo: isTipo(q.tipo) ? q.tipo : undefined,
      providerId: q.provider ? Number(q.provider) : undefined,
      soloSeleccionables: q.seleccionables === "1",
      estado: q.estado === LIBRETA_ESTADO.NUEVO ? LIBRETA_ESTADO.NUEVO : undefined,
    }),
  );
});

// POST /api/libreta — alta rápida. El chofer no queda trabado si el nombre no está;
// entra como "nuevo" para que la oficina lo confirme. La oficina da de alta confirmado.
libreta.post("/", async (c) => {
  const user = c.get("user");
  const b = (await c.req.json().catch(() => ({}))) as {
    tipo?: string;
    nombre?: string;
    provider_id?: number | null;
    agrupador?: boolean;
  };
  if (!isTipo(b.tipo)) return fail(c, "Tipo de entrada inválido", 400);
  if (!b.nombre?.trim()) return fail(c, "El nombre es obligatorio", 400);

  const esChofer = user.role === ROLES.CHOFER;
  const entry = await repo.createEntry(c.env.DB, {
    tipo: b.tipo,
    nombre: b.nombre,
    provider_id: b.provider_id ?? null,
    // Solo la oficina puede marcar un agrupador ("Varios"): no es algo que el chofer decida.
    agrupador: esChofer ? false : !!b.agrupador,
    estado: esChofer ? LIBRETA_ESTADO.NUEVO : LIBRETA_ESTADO.CONFIRMADO,
    created_by: user.driver_id,
  });
  return ok(c, entry, 201);
});

libreta.put("/:id", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  const id = Number(c.req.param("id"));
  const b = (await c.req.json().catch(() => ({}))) as {
    nombre?: string;
    agrupador?: boolean;
    estado?: string;
  };
  if (b.nombre != null && !b.nombre.trim()) return fail(c, "El nombre no puede quedar vacío", 400);
  if (b.estado != null && b.estado !== LIBRETA_ESTADO.CONFIRMADO && b.estado !== LIBRETA_ESTADO.NUEVO) {
    return fail(c, "Estado inválido", 400);
  }
  await repo.updateEntry(c.env.DB, id, {
    nombre: b.nombre,
    agrupador: b.agrupador,
    estado: b.estado as typeof LIBRETA_ESTADO.CONFIRMADO | undefined,
  });
  return ok(c, await repo.getEntry(c.env.DB, id));
});

// POST /api/libreta/:id/merge — fusiona un duplicado dentro de otra entrada.
libreta.post("/:id/merge", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  const id = Number(c.req.param("id"));
  const b = (await c.req.json().catch(() => ({}))) as { into_id?: number };
  if (!b.into_id) return fail(c, "Falta into_id (la entrada que queda)", 400);
  if (Number(b.into_id) === id) return fail(c, "No se puede fusionar una entrada consigo misma", 400);

  const [origen, destino] = await Promise.all([
    repo.getEntry(c.env.DB, id),
    repo.getEntry(c.env.DB, Number(b.into_id)),
  ]);
  if (!origen || !destino) return fail(c, "Entrada no encontrada", 404);
  if (origen.tipo !== destino.tipo) return fail(c, "Solo se fusionan entradas del mismo tipo", 400);

  await repo.mergeEntries(c.env.DB, id, Number(b.into_id));
  return ok(c, { merged: true, into: destino });
});

libreta.delete("/:id", requireRole(ROLES.ADMIN), async (c) => {
  const id = Number(c.req.param("id"));

  // Borrar un nombre se lleva sus reglas de cobro en cascada, y hasta ahora lo hacía en
  // silencio: el aviso de la pantalla colgaba de `usos`, que nunca subía. Ya pasó una vez y
  // se perdieron las reglas. Si hay reglas apuntando acá, no se borra — se fusiona, que es
  // lo que las reapunta en vez de tirarlas.
  const reglas = await repo.reglasQueDependen(c.env.DB, id);
  if (reglas) {
    return fail(
      c,
      `No se puede borrar: hay ${reglas} regla${reglas === 1 ? "" : "s"} de cobro que ${reglas === 1 ? "usa" : "usan"} este nombre. Fusionalo con el correcto para no perderlas.`,
      409,
    );
  }

  await repo.deleteEntry(c.env.DB, id);
  return ok(c, { deleted: true });
});

// ── Reglas de facturación ──

libreta.get("/reglas/all", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) =>
  ok(c, await repo.listReglas(c.env.DB)),
);

libreta.post("/reglas", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as {
    remitente_id?: number;
    destinatario_id?: number | null;
    cobro_tipo?: string;
    cobro_a?: string;
  };
  if (!b.remitente_id) return fail(c, "Falta el remitente", 400);
  if (!isCobroTipo(b.cobro_tipo)) return fail(c, "cobro_tipo debe ser cliente o proveedor", 400);
  if (!b.cobro_a?.trim()) return fail(c, "Falta a quién se factura", 400);

  await repo.upsertRegla(c.env.DB, {
    remitente_id: Number(b.remitente_id),
    destinatario_id: b.destinatario_id ? Number(b.destinatario_id) : null,
    cobro_tipo: b.cobro_tipo,
    cobro_a: b.cobro_a.trim(),
  });

  // La regla vale también para lo ya cargado: si no, el pendiente nunca se limpia y
  // definir la regla dejaría de resolver el problema que la oficina vino a resolver.
  const destrabadas = await tripsRepo.completarCobrosPendientes(
    c.env.DB,
    await repo.listReglas(c.env.DB),
  );
  return ok(c, { saved: true, destrabadas }, 201);
});

libreta.delete("/reglas/:id", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  await repo.deleteRegla(c.env.DB, Number(c.req.param("id")));
  return ok(c, { deleted: true });
});

export default libreta;
