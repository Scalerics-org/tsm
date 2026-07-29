import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES, TRIP_STATUS, type Trip, type TripTemplate } from "../../shared/domain";
import * as tripsRepo from "../repos/trips";
import * as templatesRepo from "../repos/templates";
import * as photosRepo from "../repos/photos";

const trips = new Hono<{ Bindings: Env; Variables: Vars }>();
trips.use("*", requireAuth);

const nowIso = () => new Date().toISOString().replace("T", " ").slice(0, 19);

type Scope = { trip: Trip } | { error: string; status: 403 | 404 };
async function scoped(c: any): Promise<Scope> {
  const trip = await tripsRepo.getTrip(c.env.DB, Number(c.req.param("id")));
  if (!trip) return { error: "Viaje no encontrado", status: 404 };
  const user = c.get("user");
  if (user.role === ROLES.CHOFER && trip.driver_id !== user.driver_id) {
    return { error: "No podés acceder a este viaje", status: 403 };
  }
  return { trip };
}

// Valida los campos requeridos de una etapa (carga/descarga) contra los valores enviados.
function missingField(tpl: TripTemplate, stage: string, values: Record<string, string>): string | null {
  for (const f of tpl.fields) {
    if (f.stage === stage && f.required && !String(values[f.key] ?? "").trim()) {
      return f.label;
    }
  }
  return null;
}

// GET /api/trips
trips.get("/", async (c) => {
  const user = c.get("user");
  const q = c.req.query();
  const filters: tripsRepo.TripFilters = {
    truckId: q.truck ? Number(q.truck) : undefined,
    status: (q.status as Trip["status"]) || undefined,
    from: q.from || undefined,
    to: q.to || undefined,
  };
  if (user.role === ROLES.CHOFER) {
    if (user.driver_id == null) return ok(c, []);
    filters.onlyDriverId = user.driver_id;
  } else if (q.driver) {
    filters.driverId = Number(q.driver);
  }
  return ok(c, await tripsRepo.listTrips(c.env.DB, filters));
});

// GET /api/trips/active — viaje en curso del chofer
trips.get("/active", async (c) => {
  const user = c.get("user");
  if (user.role !== ROLES.CHOFER || user.driver_id == null) return ok(c, null);
  return ok(c, await tripsRepo.activeTripForDriver(c.env.DB, user.driver_id));
});

// GET /api/trips/:id — detalle + fotos + definición de campos de la plantilla
trips.get("/:id", async (c) => {
  const s = await scoped(c);
  if ("error" in s) return fail(c, s.error, s.status);
  const [photos, tpl] = await Promise.all([
    photosRepo.listPhotos(c.env.DB, s.trip.id),
    s.trip.template_id ? templatesRepo.getTemplate(c.env.DB, s.trip.template_id) : Promise.resolve(null),
  ]);
  const trip = { ...s.trip, fields: tpl?.fields ?? [] };
  return ok(c, { trip, photos, arrival_photo_label: tpl?.arrival_photo_label ?? null });
});

// POST /api/trips — el chofer inicia un viaje desde una plantilla
trips.post("/", async (c) => {
  const user = c.get("user");
  if (user.role !== ROLES.CHOFER || user.driver_id == null) {
    return fail(c, "Solo un chofer puede iniciar un viaje", 403);
  }
  const b = await c.req.json<any>().catch(() => null);
  if (!b || !b.template_id || !b.destino) return fail(c, "Elegí el viaje y el destino", 400);

  const tpl = await templatesRepo.getTemplate(c.env.DB, Number(b.template_id));
  if (!tpl || !tpl.active) return fail(c, "Plantilla de viaje no disponible", 404);

  const values: Record<string, string> = b.field_values ?? {};
  const missing = missingField(tpl, "carga", values);
  if (missing) return fail(c, `Falta: ${missing}`, 400);

  const weightField = tpl.fields.find((f) => f.is_weight);
  const weight = weightField && values[weightField.key] ? Number(values[weightField.key]) : null;

  const truckId = b.truck_id ? Number(b.truck_id) : user.truck_id;
  if (!truckId) return fail(c, "No tenés un camión asignado", 400);

  const id = await tripsRepo.startTrip(c.env.DB, {
    template_id: tpl.id,
    provider_name: tpl.provider_name ?? "",
    origin: b.origin ? String(b.origin) : tpl.origin,
    remite: tpl.remite,
    destination: String(b.destino),
    destinatario: b.destinatario ? String(b.destinatario) : null,
    driver_id: user.driver_id,
    truck_id: truckId,
    cargo_type: tpl.cargo_type,
    weight_tons: weight != null && !isNaN(weight) ? weight : null,
    field_values: values,
  });
  return ok(c, await tripsRepo.getTrip(c.env.DB, id), 201);
});

// POST /api/trips/:id/finish — registrar llegada (campos de descarga + observaciones)
trips.post("/:id/finish", async (c) => {
  const s = await scoped(c);
  if ("error" in s) return fail(c, s.error, s.status);
  if (s.trip.status !== TRIP_STATUS.EN_CURSO) return fail(c, "El viaje no está en curso", 409);

  const b = (await c.req.json().catch(() => ({}))) as {
    field_values?: Record<string, string>;
    notes?: string;
  };
  const merged = { ...s.trip.field_values, ...(b.field_values ?? {}) };

  if (s.trip.template_id) {
    const tpl = await templatesRepo.getTemplate(c.env.DB, s.trip.template_id);
    if (tpl) {
      const missing = missingField(tpl, "descarga", merged);
      if (missing) return fail(c, `Falta: ${missing}`, 400);
    }
  }

  await tripsRepo.finishTrip(c.env.DB, s.trip.id, nowIso(), merged, b.notes ?? s.trip.notes ?? null);
  return ok(c, await tripsRepo.getTrip(c.env.DB, s.trip.id));
});

// POST /api/trips/:id/cancel
trips.post("/:id/cancel", async (c) => {
  const s = await scoped(c);
  if ("error" in s) return fail(c, s.error, s.status);
  const b = (await c.req.json().catch(() => ({}))) as { notes?: string };
  await tripsRepo.cancelTrip(c.env.DB, s.trip.id, b.notes ?? "");
  return ok(c, await tripsRepo.getTrip(c.env.DB, s.trip.id));
});

trips.delete("/:id", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  await c.env.DB.prepare("DELETE FROM trips WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return ok(c, { deleted: true });
});

export default trips;
