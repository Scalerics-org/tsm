import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { ok, fail } from "../lib/response";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES, TRIP_STATUS, type Trip, type TripStatus } from "../../shared/domain";
import * as tripsRepo from "../repos/trips";
import * as positionsRepo from "../repos/positions";
import * as photosRepo from "../repos/photos";
import * as trucksRepo from "../repos/trucks";
import { notifyDriver, notifyRole } from "../lib/push";

const trips = new Hono<{ Bindings: Env; Variables: Vars }>();
trips.use("*", requireAuth);

function nowIso(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

type ScopeResult = { trip: Trip } | { error: string; status: 403 | 404 };

// Verifica que el viaje pertenezca al chofer, o que el usuario sea ops/admin.
async function loadTripScoped(c: any): Promise<ScopeResult> {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  const trip = await tripsRepo.getTrip(c.env.DB, id);
  if (!trip) return { error: "Viaje no encontrado", status: 404 };
  if (user.role === ROLES.CHOFER && trip.driver_id !== user.driver_id) {
    return { error: "No podés acceder a este viaje", status: 403 };
  }
  return { trip };
}

// GET /api/trips  — lista con filtros (chofer sólo ve lo suyo)
trips.get("/", async (c) => {
  const user = c.get("user");
  const q = c.req.query();
  const filters: tripsRepo.TripFilters = {
    truckId: q.truck ? Number(q.truck) : undefined,
    status: (q.status as TripStatus) || undefined,
    date: q.date || undefined,
  };
  if (user.role === ROLES.CHOFER) {
    if (user.driver_id == null) return ok(c, []);
    filters.onlyDriverId = user.driver_id;
  } else if (q.driver) {
    filters.driverId = Number(q.driver);
  }
  const list = await tripsRepo.listTrips(c.env.DB, filters);
  return ok(c, list);
});

// GET /api/trips/:id — detalle con carga, fotos y posiciones
trips.get("/:id", async (c) => {
  const scoped = await loadTripScoped(c);
  if ("error" in scoped) return fail(c, scoped.error, scoped.status);
  const trip = scoped.trip;
  const [photos, positions] = await Promise.all([
    photosRepo.listPhotos(c.env.DB, trip.id),
    positionsRepo.listPositions(c.env.DB, trip.id),
  ]);
  return ok(c, { trip, photos, positions });
});

// POST /api/trips — crear (encargado/admin)
trips.post("/", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  const user = c.get("user");
  const b = await c.req.json<any>().catch(() => null);
  if (!b) return fail(c, "Cuerpo inválido", 400);
  if (!b.driver_id || !b.truck_id || !b.origin || !b.destination || !b.scheduled_at) {
    return fail(c, "Faltan campos obligatorios (chofer, camión, origen, destino, fecha)", 400);
  }

  let cargoId: number | null = null;
  if (b.cargo && b.cargo.description) {
    cargoId = await tripsRepo.createCargo(c.env.DB, {
      description: b.cargo.description,
      weight_kg: b.cargo.weight_kg ?? null,
      quantity: b.cargo.quantity ?? null,
      client: b.cargo.client ?? null,
      type: b.cargo.type ?? null,
      doc_number: b.cargo.doc_number ?? null,
    });
  }

  const id = await tripsRepo.createTrip(c.env.DB, {
    driver_id: Number(b.driver_id),
    truck_id: Number(b.truck_id),
    origin: b.origin,
    origin_lat: b.origin_lat ?? null,
    origin_lon: b.origin_lon ?? null,
    destination: b.destination,
    dest_lat: b.dest_lat ?? null,
    dest_lon: b.dest_lon ?? null,
    scheduled_at: b.scheduled_at,
    cargo_id: cargoId,
    distance_km: Number(b.distance_km ?? 0),
    created_by: user.id,
  });
  const trip = await tripsRepo.getTrip(c.env.DB, id);
  await notifyDriver(c.env, Number(b.driver_id), {
    title: "Nuevo viaje asignado",
    body: `${b.origin} → ${b.destination}`,
    url: "/viajes",
    tag: `trip-${id}`,
  });
  return ok(c, trip, 201);
});

// PUT /api/trips/:id — editar un viaje pendiente (encargado/admin)
trips.put("/:id", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await tripsRepo.getTrip(c.env.DB, id);
  if (!existing) return fail(c, "Viaje no encontrado", 404);
  if (existing.status !== TRIP_STATUS.PENDIENTE) {
    return fail(c, "Solo se puede editar un viaje pendiente", 409);
  }
  const b = await c.req.json<any>().catch(() => null);
  if (!b || !b.driver_id || !b.truck_id || !b.origin || !b.destination || !b.scheduled_at) {
    return fail(c, "Faltan campos obligatorios", 400);
  }

  // Reemplaza la carga (crea una nueva si viene descripción).
  let cargoId: number | null = existing.cargo_id;
  if (b.cargo && b.cargo.description) {
    cargoId = await tripsRepo.createCargo(c.env.DB, {
      description: b.cargo.description,
      weight_kg: b.cargo.weight_kg ?? null,
      quantity: b.cargo.quantity ?? null,
      client: b.cargo.client ?? null,
      type: b.cargo.type ?? null,
      doc_number: b.cargo.doc_number ?? null,
    });
  }

  await tripsRepo.editTrip(c.env.DB, id, {
    driver_id: Number(b.driver_id),
    truck_id: Number(b.truck_id),
    origin: b.origin,
    origin_lat: b.origin_lat ?? null,
    origin_lon: b.origin_lon ?? null,
    destination: b.destination,
    dest_lat: b.dest_lat ?? null,
    dest_lon: b.dest_lon ?? null,
    scheduled_at: b.scheduled_at,
    cargo_id: cargoId,
    distance_km: Number(b.distance_km ?? 0),
  });
  return ok(c, await tripsRepo.getTrip(c.env.DB, id));
});

// POST /api/trips/:id/departure — registrar salida (chofer dueño)
trips.post("/:id/departure", async (c) => {
  const scoped = await loadTripScoped(c);
  if ("error" in scoped) return fail(c, scoped.error, scoped.status);
  const trip = scoped.trip;
  if (trip.status !== TRIP_STATUS.PENDIENTE) {
    return fail(c, "El viaje no está pendiente", 409);
  }
  await tripsRepo.markDeparted(c.env.DB, trip.id, nowIso());
  await trucksRepo.setTruckStatus(c.env.DB, trip.truck_id, "en_viaje");
  await notifyRole(c.env, ROLES.ENCARGADO, {
    title: "Viaje en ruta",
    body: `${trip.origin} → ${trip.destination} salió`,
    url: `/panel/viajes/${trip.id}`,
    tag: `trip-${trip.id}`,
  });
  return ok(c, await tripsRepo.getTrip(c.env.DB, trip.id));
});

// POST /api/trips/:id/positions — el chofer envía un lote de puntos GPS
trips.post("/:id/positions", async (c) => {
  const scoped = await loadTripScoped(c);
  if ("error" in scoped) return fail(c, scoped.error, scoped.status);
  const trip = scoped.trip;
  const b = (await c.req.json().catch(() => ({}))) as { points?: positionsRepo.IncomingPoint[] };
  const points = (b.points ?? []).filter(
    (p) => typeof p.lat === "number" && typeof p.lon === "number",
  );
  if (points.length === 0) return fail(c, "Sin puntos válidos", 400);

  await positionsRepo.appendPositions(c.env.DB, trip.id, points);
  const distance = await positionsRepo.distanceFromPositions(c.env.DB, trip.id);
  await tripsRepo.updateDistance(c.env.DB, trip.id, distance);
  return ok(c, { distance_km: distance });
});

// GET /api/trips/:id/positions — traza + km actuales (para el panel en vivo)
trips.get("/:id/positions", async (c) => {
  const scoped = await loadTripScoped(c);
  if ("error" in scoped) return fail(c, scoped.error, scoped.status);
  const positions = await positionsRepo.listPositions(c.env.DB, scoped.trip.id);
  return ok(c, { positions, distance_km: scoped.trip.distance_km });
});

// POST /api/trips/:id/arrival — registrar llegada (chofer dueño)
trips.post("/:id/arrival", async (c) => {
  const scoped = await loadTripScoped(c);
  if ("error" in scoped) return fail(c, scoped.error, scoped.status);
  const trip = scoped.trip;
  if (trip.status !== TRIP_STATUS.EN_RUTA) {
    return fail(c, "El viaje no está en ruta", 409);
  }
  const b = (await c.req.json().catch(() => ({}))) as { manual_km?: number; actual_liters?: number };

  const gpsKm = await positionsRepo.distanceFromPositions(c.env.DB, trip.id);
  const manualKm = b.manual_km != null ? Number(b.manual_km) : null;
  const actualLiters = b.actual_liters != null && b.actual_liters !== 0 ? Number(b.actual_liters) : null;
  // GPS es la fuente principal; si no hubo señal (gpsKm ~ 0) usamos el respaldo manual.
  const finalKm = gpsKm > 0.1 ? gpsKm : manualKm ?? 0;

  await tripsRepo.markArrived(c.env.DB, trip.id, nowIso(), finalKm, manualKm, actualLiters);
  await trucksRepo.setTruckStatus(c.env.DB, trip.truck_id, "disponible");
  await trucksRepo.addOdometer(c.env.DB, trip.truck_id, finalKm);
  await notifyRole(c.env, ROLES.ENCARGADO, {
    title: "Viaje completado",
    body: `${trip.origin} → ${trip.destination} llegó`,
    url: `/panel/viajes/${trip.id}`,
    tag: `trip-${trip.id}`,
  });
  return ok(c, await tripsRepo.getTrip(c.env.DB, trip.id));
});

// POST /api/trips/:id/incident — marcar incidencia (chofer u ops)
trips.post("/:id/incident", async (c) => {
  const scoped = await loadTripScoped(c);
  if ("error" in scoped) return fail(c, scoped.error, scoped.status);
  const b = (await c.req.json().catch(() => ({}))) as { notes?: string };
  await tripsRepo.setStatus(c.env.DB, scoped.trip.id, TRIP_STATUS.CON_INCIDENCIA, b.notes ?? "");
  await notifyRole(c.env, ROLES.ENCARGADO, {
    title: "⚠ Incidencia en viaje",
    body: `${scoped.trip.origin} → ${scoped.trip.destination}: ${b.notes ?? "sin detalle"}`,
    url: `/panel/viajes/${scoped.trip.id}`,
    tag: `trip-${scoped.trip.id}`,
  });
  return ok(c, await tripsRepo.getTrip(c.env.DB, scoped.trip.id));
});

// POST /api/trips/:id/cancel — cancelar (ops/admin)
trips.post("/:id/cancel", requireRole(ROLES.ENCARGADO, ROLES.ADMIN), async (c) => {
  const id = Number(c.req.param("id"));
  const trip = await tripsRepo.getTrip(c.env.DB, id);
  if (!trip) return fail(c, "Viaje no encontrado", 404);
  await tripsRepo.setStatus(c.env.DB, id, TRIP_STATUS.CANCELADO);
  if (trip.status === TRIP_STATUS.EN_RUTA) {
    await trucksRepo.setTruckStatus(c.env.DB, trip.truck_id, "disponible");
  }
  return ok(c, await tripsRepo.getTrip(c.env.DB, id));
});

export default trips;
