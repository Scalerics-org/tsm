import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth } from "../middleware/auth";
import { ROLES, fuelFeedback } from "../../shared/domain";
import * as repo from "../repos/fuel";

const fuel = new Hono<{ Bindings: Env; Variables: Vars }>();
fuel.use("*", requireAuth);

// GET /api/fuel?truck=..  — surtidas (chofer ve las de su camión)
fuel.get("/", async (c) => {
  const user = c.get("user");
  const q = c.req.query();
  const truckId =
    user.role === ROLES.CHOFER ? (user.truck_id ?? -1) : q.truck ? Number(q.truck) : undefined;
  return ok(c, await repo.listFuelLogs(c.env.DB, { truckId, from: q.from, to: q.to }));
});

// POST /api/fuel — registrar una surtida (multipart con foto del tacógrafo)
fuel.post("/", async (c) => {
  const user = c.get("user");
  const form = await c.req.formData().catch(() => null);
  if (!form) return fail(c, "Se esperaba multipart/form-data", 400);

  const odometer = Number(form.get("odometer_km"));
  const liters = Number(form.get("liters"));
  if (!odometer || !liters) return fail(c, "Odómetro y litros son obligatorios", 400);

  const truckId =
    user.role === ROLES.CHOFER ? user.truck_id : form.get("truck_id") ? Number(form.get("truck_id")) : null;
  if (!truckId) return fail(c, "Falta el camión", 400);

  // Subir la foto del tacógrafo a R2 (si está configurado).
  let r2Key: string | null = null;
  const file = form.get("file");
  if (file && typeof file !== "string" && c.env.FOTOS) {
    const f = file as unknown as File;
    const ext = (f.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    r2Key = `fuel/${truckId}/${Date.now()}.${ext}`;
    await c.env.FOTOS.put(r2Key, await f.arrayBuffer(), {
      httpMetadata: { contentType: f.type || "image/jpeg" },
    });
  }

  const isFull = form.get("is_full") !== "false";
  const id = await repo.createFuelLog(c.env.DB, {
    truck_id: truckId,
    driver_id: user.driver_id,
    trip_id: form.get("trip_id") ? Number(form.get("trip_id")) : null,
    odometer_km: odometer,
    liters,
    is_full: isFull,
    r2_key: r2Key,
  });

  // Feedback de consumo (tramo cerrado al llenar + acumulado mensual).
  const logs = await repo.listFuelLogs(c.env.DB, { truckId });
  const feedback = fuelFeedback(
    logs.map((l) => ({
      odometer_km: l.odometer_km,
      liters: l.liters,
      is_full: !!l.is_full,
      logged_at: l.logged_at,
    })),
    { odometer_km: odometer, liters, is_full: isFull, logged_at: new Date().toISOString().slice(0, 10) },
  );
  return ok(c, { id, r2_key: r2Key, feedback }, 201);
});

export default fuel;
