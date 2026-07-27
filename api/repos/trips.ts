import type { Trip, TripStatus } from "../../shared/domain";

const SELECT = `
  SELECT t.*, d.name AS driver_name, tr.plate AS truck_plate
  FROM trips t
  JOIN drivers d ON d.id = t.driver_id
  JOIN trucks tr ON tr.id = t.truck_id
`;

export interface TripFilters {
  driverId?: number;
  truckId?: number;
  status?: TripStatus;
  onlyDriverId?: number;
  from?: string; // YYYY-MM-DD
  to?: string;
}

export async function listTrips(db: D1Database, f: TripFilters): Promise<Trip[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  const scope = f.onlyDriverId ?? f.driverId;
  if (scope != null) {
    where.push("t.driver_id = ?");
    binds.push(scope);
  }
  if (f.truckId != null) {
    where.push("t.truck_id = ?");
    binds.push(f.truckId);
  }
  if (f.status) {
    where.push("t.status = ?");
    binds.push(f.status);
  }
  if (f.from) {
    where.push("substr(t.started_at,1,10) >= ?");
    binds.push(f.from);
  }
  if (f.to) {
    where.push("substr(t.started_at,1,10) <= ?");
    binds.push(f.to);
  }
  const sql = SELECT + (where.length ? ` WHERE ${where.join(" AND ")}` : "") + " ORDER BY t.started_at DESC";
  const { results } = await db.prepare(sql).bind(...binds).all<Trip>();
  return results ?? [];
}

export async function getTrip(db: D1Database, id: number): Promise<Trip | null> {
  return (await db.prepare(`${SELECT} WHERE t.id = ?`).bind(id).first<Trip>()) ?? null;
}

export interface StartTripInput {
  template_id: number | null;
  provider_name: string;
  origin: string;
  destination: string;
  driver_id: number;
  truck_id: number;
  cargo_type: string;
  kilos: number | null;
  extra_label: string | null;
  extra_value: string | null;
}

export async function startTrip(db: D1Database, t: StartTripInput): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO trips (template_id, provider_name, origin, destination, driver_id, truck_id, cargo_type, kilos, extra_label, extra_value, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EN_CURSO')`,
    )
    .bind(
      t.template_id, t.provider_name, t.origin, t.destination, t.driver_id, t.truck_id, t.cargo_type,
      t.kilos, t.extra_label, t.extra_value,
    )
    .run();
  return res.meta.last_row_id as number;
}

export async function finishTrip(db: D1Database, id: number, when: string): Promise<void> {
  await db
    .prepare("UPDATE trips SET status='COMPLETADO', finished_at=? WHERE id=? AND status='EN_CURSO'")
    .bind(when, id)
    .run();
}

export async function cancelTrip(db: D1Database, id: number, notes: string): Promise<void> {
  await db
    .prepare("UPDATE trips SET status='CANCELADO', notes=? WHERE id=?")
    .bind(notes, id)
    .run();
}

export async function activeTripForDriver(db: D1Database, driverId: number): Promise<Trip | null> {
  return (
    (await db
      .prepare(`${SELECT} WHERE t.driver_id = ? AND t.status = 'EN_CURSO' ORDER BY t.started_at DESC LIMIT 1`)
      .bind(driverId)
      .first<Trip>()) ?? null
  );
}
