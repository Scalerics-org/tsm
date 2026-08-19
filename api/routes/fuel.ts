import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES, fuelFeedback, litrosTotales } from "../../shared/domain";
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
  // Los dos tanques llegan por separado y el total se suma acá. La pantalla vieja mandaba
  // sólo `liters`, así que se acepta igual: el desglose queda en null.
  const t1 = numeroOpcional(form.get("liters_tanque1"));
  const t2 = numeroOpcional(form.get("liters_tanque2"));
  const porTanque = litrosTotales(t1, t2);
  const liters = porTanque ?? Number(form.get("liters"));
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
    liters_tanque1: t1,
    liters_tanque2: t2,
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

/** Un campo numérico que puede no venir. `null` = no lo mandaron; distinto de un 0 escrito. */
function numeroOpcional(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * PUT /api/fuel/:id — la oficina corrige una surtida.
 *
 * "Al igual gas oil desde oficina, corregir litros y km." Es lo que pidió el cliente para
 * arreglar un tipeo del surtidor. Las fotos NO se tocan: son la evidencia de lo que pasó, y
 * si se pudieran cambiar dejarían de servir para eso.
 *
 * Corregir los km de una surtida vieja recalcula el consumo de ese mes y de todos los
 * siguientes, porque la cadena de odómetro es acumulativa. Por eso queda quién lo hizo.
 */
fuel.put("/:id", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  const id = Number(c.req.param("id"));
  const previa = await repo.getFuelLog(c.env.DB, id);
  if (!previa) return fail(c, "Surtida no encontrada", 404);

  const b = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return fail(c, "Faltan datos", 400);

  const odometer = Number(b.odometer_km);
  if (!Number.isFinite(odometer) || odometer <= 0) return fail(c, "El odómetro tiene que ser un número mayor que cero", 400);

  const t1 = numeroOpcional(b.liters_tanque1);
  const t2 = numeroOpcional(b.liters_tanque2);
  const porTanque = litrosTotales(t1, t2);
  const liters = porTanque ?? Number(b.liters);
  if (!Number.isFinite(liters) || liters <= 0) return fail(c, "Los litros tienen que ser un número mayor que cero", 400);

  await repo.updateFuelLog(
    c.env.DB,
    id,
    {
      odometer_km: odometer,
      liters,
      liters_tanque1: t1,
      liters_tanque2: t2,
      is_full: b.is_full === undefined ? !!previa.is_full : !!b.is_full,
    },
    { userId: c.get("user").id, when: new Date().toISOString().replace("T", " ").slice(0, 19) },
  );
  return ok(c, await repo.getFuelLog(c.env.DB, id));
});

// DELETE /api/fuel/:id — sacar una surtida cargada por error.
fuel.delete("/:id", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  const truckId = await repo.deleteFuelLog(c.env.DB, Number(c.req.param("id")));
  if (truckId == null) return fail(c, "Surtida no encontrada", 404);
  return ok(c, { deleted: true });
});

export default fuel;
