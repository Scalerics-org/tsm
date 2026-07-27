import type { Cargo, Trip, TripStatus } from "../../shared/domain";

const SELECT_TRIP = `
  SELECT t.*, d.name AS driver_name, tr.plate AS truck_plate,
         tr.avg_consumption_l100 AS truck_consumption
  FROM trips t
  JOIN drivers d ON d.id = t.driver_id
  JOIN trucks  tr ON tr.id = t.truck_id
`;

export interface TripFilters {
  driverId?: number; // filtro por chofer (encargado/admin)
  truckId?: number;
  status?: TripStatus;
  date?: string; // YYYY-MM-DD sobre scheduled_at
  onlyDriverId?: number; // fuerza el scope de un chofer (rol chofer)
}

export async function listTrips(db: D1Database, f: TripFilters): Promise<Trip[]> {
  const where: string[] = [];
  const binds: unknown[] = [];

  if (f.onlyDriverId != null) {
    where.push("t.driver_id = ?");
    binds.push(f.onlyDriverId);
  } else if (f.driverId != null) {
    where.push("t.driver_id = ?");
    binds.push(f.driverId);
  }
  if (f.truckId != null) {
    where.push("t.truck_id = ?");
    binds.push(f.truckId);
  }
  if (f.status) {
    where.push("t.status = ?");
    binds.push(f.status);
  }
  if (f.date) {
    where.push("substr(t.scheduled_at, 1, 10) = ?");
    binds.push(f.date);
  }

  const sql =
    SELECT_TRIP +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY t.scheduled_at DESC";
  const { results } = await db.prepare(sql).bind(...binds).all<Trip>();
  return results ?? [];
}

export async function getTrip(db: D1Database, id: number): Promise<Trip | null> {
  const trip = await db.prepare(`${SELECT_TRIP} WHERE t.id = ?`).bind(id).first<Trip>();
  if (!trip) return null;
  if (trip.cargo_id != null) {
    trip.cargo = (await db
      .prepare("SELECT * FROM cargos WHERE id = ?")
      .bind(trip.cargo_id)
      .first<Cargo>()) ?? null;
  } else {
    trip.cargo = null;
  }
  return trip;
}

export interface NewCargo {
  description: string;
  weight_kg: number | null;
  quantity: number | null;
  client: string | null;
  type: string | null;
  doc_number: string | null;
}

export async function createCargo(db: D1Database, cg: NewCargo): Promise<number> {
  const res = await db
    .prepare(
      "INSERT INTO cargos (description, weight_kg, quantity, client, type, doc_number) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(cg.description, cg.weight_kg, cg.quantity, cg.client, cg.type, cg.doc_number)
    .run();
  return res.meta.last_row_id as number;
}

export interface NewTrip {
  driver_id: number;
  truck_id: number;
  origin: string;
  origin_lat: number | null;
  origin_lon: number | null;
  destination: string;
  dest_lat: number | null;
  dest_lon: number | null;
  scheduled_at: string;
  cargo_id: number | null;
  distance_km: number;
  created_by: number;
}

export async function createTrip(db: D1Database, t: NewTrip): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO trips (driver_id, truck_id, origin, origin_lat, origin_lon, destination, dest_lat, dest_lon,
                          scheduled_at, cargo_id, distance_km, created_by, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE')`,
    )
    .bind(
      t.driver_id, t.truck_id, t.origin, t.origin_lat, t.origin_lon, t.destination, t.dest_lat, t.dest_lon,
      t.scheduled_at, t.cargo_id, t.distance_km, t.created_by,
    )
    .run();
  return res.meta.last_row_id as number;
}

export async function markDeparted(db: D1Database, id: number, when: string): Promise<void> {
  await db
    .prepare("UPDATE trips SET status='EN_RUTA', departed_at=? WHERE id=? AND status='PENDIENTE'")
    .bind(when, id)
    .run();
}

export async function markArrived(
  db: D1Database,
  id: number,
  when: string,
  distanceKm: number,
  manualKm: number | null,
): Promise<void> {
  await db
    .prepare(
      "UPDATE trips SET status='COMPLETADO', arrived_at=?, distance_km=?, manual_km=? WHERE id=? AND status='EN_RUTA'",
    )
    .bind(when, distanceKm, manualKm, id)
    .run();
}

export async function setStatus(db: D1Database, id: number, status: TripStatus, notes?: string): Promise<void> {
  if (notes !== undefined) {
    await db.prepare("UPDATE trips SET status=?, notes=? WHERE id=?").bind(status, notes, id).run();
  } else {
    await db.prepare("UPDATE trips SET status=? WHERE id=?").bind(status, id).run();
  }
}

export async function updateDistance(db: D1Database, id: number, km: number): Promise<void> {
  await db.prepare("UPDATE trips SET distance_km=? WHERE id=?").bind(km, id).run();
}
