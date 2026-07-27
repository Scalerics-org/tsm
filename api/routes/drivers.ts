import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES, DRIVER_STATUS } from "../../shared/domain";
import * as repo from "../repos/drivers";

const drivers = new Hono<{ Bindings: Env; Variables: Vars }>();
drivers.use("*", requireAuth);

// Encargado y admin pueden leer (necesario para asignar viajes).
drivers.get("/", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) =>
  ok(c, await repo.listDrivers(c.env.DB)),
);

function parseDriver(b: any): repo.DriverInput | null {
  if (!b || !b.name || !b.document) return null;
  return {
    name: String(b.name),
    document: String(b.document),
    license_number: String(b.license_number ?? ""),
    license_category: String(b.license_category ?? ""),
    license_expiry: String(b.license_expiry ?? ""),
    phone: String(b.phone ?? ""),
    status: b.status === DRIVER_STATUS.INACTIVO ? DRIVER_STATUS.INACTIVO : DRIVER_STATUS.ACTIVO,
  };
}

// Alta/edición/baja: sólo admin.
drivers.post("/", requireRole(ROLES.ADMIN), async (c) => {
  const input = parseDriver(await c.req.json().catch(() => null));
  if (!input) return fail(c, "Nombre y documento son obligatorios", 400);
  const id = await repo.createDriver(c.env.DB, input);
  return ok(c, await repo.getDriver(c.env.DB, id), 201);
});

drivers.put("/:id", requireRole(ROLES.ADMIN), async (c) => {
  const id = Number(c.req.param("id"));
  const input = parseDriver(await c.req.json().catch(() => null));
  if (!input) return fail(c, "Nombre y documento son obligatorios", 400);
  await repo.updateDriver(c.env.DB, id, input);
  return ok(c, await repo.getDriver(c.env.DB, id));
});

drivers.delete("/:id", requireRole(ROLES.ADMIN), async (c) => {
  await repo.deleteDriver(c.env.DB, Number(c.req.param("id")));
  return ok(c, { deleted: true });
});

export default drivers;
