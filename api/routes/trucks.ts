import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES, TRUCK_STATUS, type TruckStatus } from "../../shared/domain";
import * as repo from "../repos/trucks";

const trucks = new Hono<{ Bindings: Env; Variables: Vars }>();
trucks.use("*", requireAuth);

trucks.get("/", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) =>
  ok(c, await repo.listTrucks(c.env.DB)),
);

// Lista mínima (id + patente) para que el chofer elija con qué camión viaja.
trucks.get("/options", async (c) =>
  ok(c, (await repo.listTrucks(c.env.DB)).map((t) => ({ id: t.id, plate: t.plate }))),
);

const STATUSES: TruckStatus[] = [
  TRUCK_STATUS.DISPONIBLE,
  TRUCK_STATUS.EN_VIAJE,
  TRUCK_STATUS.MANTENIMIENTO,
];

function parseTruck(b: any): repo.TruckInput | null {
  if (!b || !b.plate) return null;
  return {
    plate: String(b.plate).toUpperCase().trim(),
    brand: String(b.brand ?? ""),
    model: String(b.model ?? ""),
    year: Number(b.year ?? 0),
    type: String(b.type ?? ""),
    capacity_kg: Number(b.capacity_kg ?? 0),
    odometer_km: Number(b.odometer_km ?? 0),
    avg_km_litro: Number(b.avg_km_litro ?? 0),
    status: STATUSES.includes(b.status) ? b.status : TRUCK_STATUS.DISPONIBLE,
  };
}

trucks.post("/", requireRole(ROLES.ADMIN), async (c) => {
  const input = parseTruck(await c.req.json().catch(() => null));
  if (!input) return fail(c, "La patente es obligatoria", 400);
  const id = await repo.createTruck(c.env.DB, input);
  return ok(c, await repo.getTruck(c.env.DB, id), 201);
});

trucks.put("/:id", requireRole(ROLES.ADMIN), async (c) => {
  const id = Number(c.req.param("id"));
  const input = parseTruck(await c.req.json().catch(() => null));
  if (!input) return fail(c, "La patente es obligatoria", 400);
  await repo.updateTruck(c.env.DB, id, input);
  return ok(c, await repo.getTruck(c.env.DB, id));
});

trucks.delete("/:id", requireRole(ROLES.ADMIN), async (c) => {
  await repo.deleteTruck(c.env.DB, Number(c.req.param("id")));
  return ok(c, { deleted: true });
});

export default trucks;
