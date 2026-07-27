import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES, DRIVER_STATUS } from "../../shared/domain";
import { hashPassword } from "../lib/crypto";
import * as repo from "../repos/drivers";

const drivers = new Hono<{ Bindings: Env; Variables: Vars }>();
drivers.use("*", requireAuth);

drivers.get("/", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) =>
  ok(c, await repo.listDrivers(c.env.DB)),
);

function parse(b: any): repo.DriverInput | null {
  if (!b || !b.name || !b.document) return null;
  return {
    name: String(b.name),
    document: String(b.document),
    license_number: String(b.license_number ?? ""),
    license_category: String(b.license_category ?? ""),
    license_expiry: String(b.license_expiry ?? ""),
    phone: String(b.phone ?? ""),
    status: b.status === DRIVER_STATUS.INACTIVO ? DRIVER_STATUS.INACTIVO : DRIVER_STATUS.ACTIVO,
    default_truck_id: b.default_truck_id ? Number(b.default_truck_id) : null,
  };
}

drivers.post("/", requireRole(ROLES.ADMIN), async (c) => {
  const b = await c.req.json<any>().catch(() => null);
  const input = parse(b);
  if (!input) return fail(c, "Nombre y documento son obligatorios", 400);
  if (!b.pin || String(b.pin).length < 4) return fail(c, "El PIN debe tener al menos 4 dígitos", 400);
  const pinHash = await hashPassword(String(b.pin));
  const id = await repo.createDriver(c.env.DB, input, pinHash);
  return ok(c, await repo.getDriver(c.env.DB, id), 201);
});

drivers.put("/:id", requireRole(ROLES.ADMIN), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<any>().catch(() => null);
  const input = parse(b);
  if (!input) return fail(c, "Nombre y documento son obligatorios", 400);
  await repo.updateDriver(c.env.DB, id, input);
  if (b.pin && String(b.pin).length >= 4) {
    await repo.setPin(c.env.DB, id, await hashPassword(String(b.pin)));
  }
  return ok(c, await repo.getDriver(c.env.DB, id));
});

drivers.delete("/:id", requireRole(ROLES.ADMIN), async (c) => {
  await repo.deleteDriver(c.env.DB, Number(c.req.param("id")));
  return ok(c, { deleted: true });
});

export default drivers;
