import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth } from "../middleware/auth";
import { ROLES, fuelFeedback } from "../../shared/domain";
import * as repo from "../repos/fuel";
import * as tripsRepo from "../repos/trips";

const fuel = new Hono<{ Bindings: Env; Variables: Vars }>();
fuel.use("*", requireAuth);

/**
 * El camión con el que el chofer está andando, no el que tiene asignado.
 *
 * Puede estar manejando otro: lo elige al salir. La surtida tiene que ir a la cadena de
 * odómetro del camión que de verdad cargó el gasoil — si no, el consumo de los dos camiones
 * queda mal, el que sumó litros que no gastó y el que perdió los kilómetros.
 *
 * Si todavía no arrancó el viaje no hay de dónde sacarlo y se cae al asignado.
 */
async function camionDelChofer(c: any, user: { role: string; driver_id: number | null; truck_id: number | null }) {
  if (user.role !== ROLES.CHOFER || user.driver_id == null) return null;
  const enViaje = await tripsRepo.activeTripForDriver(c.env.DB, user.driver_id);
  return enViaje?.truck_id ?? user.truck_id;
}

// GET /api/fuel?truck=..  — surtidas (chofer ve las de su camión)
fuel.get("/", async (c) => {
  const user = c.get("user");
  const q = c.req.query();
  const truckId =
    user.role === ROLES.CHOFER
      ? ((await camionDelChofer(c, user)) ?? -1)
      : q.truck
        ? Number(q.truck)
        : undefined;
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
    user.role === ROLES.CHOFER
      ? await camionDelChofer(c, user)
      : form.get("truck_id")
        ? Number(form.get("truck_id"))
        : null;
  if (!truckId) return fail(c, "Falta el camión", 400);

  // Dos fotos: el tacógrafo (de donde salen los km) y la boleta de gasoil (de donde
  // salen los litros). Cada una respalda un número distinto del consumo.
  const subir = async (campo: string, sufijo: string): Promise<string | null> => {
    const file = form.get(campo);
    if (!file || typeof file === "string" || !c.env.FOTOS) return null;
    const f = file as unknown as File;
    const ext = (f.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const key = `fuel/${truckId}/${sufijo}-${Date.now()}.${ext}`;
    await c.env.FOTOS.put(key, await f.arrayBuffer(), {
      httpMetadata: { contentType: f.type || "image/jpeg" },
    });
    return key;
  };
  const r2Key = await subir("file", "tacografo");
  const r2KeyBoleta = await subir("boleta", "boleta");

  const isFull = form.get("is_full") !== "false";
  const id = await repo.createFuelLog(c.env.DB, {
    truck_id: truckId,
    driver_id: user.driver_id,
    trip_id: form.get("trip_id") ? Number(form.get("trip_id")) : null,
    odometer_km: odometer,
    liters,
    is_full: isFull,
    r2_key: r2Key,
    r2_key_boleta: r2KeyBoleta,
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
  return ok(c, { id, r2_key: r2Key, r2_key_boleta: r2KeyBoleta, feedback }, 201);
});

export default fuel;
