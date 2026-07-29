import type { Trip, TripStatus } from "../../shared/domain";

interface TripRow {
  id: number;
  template_id: number | null;
  provider_name: string;
  origin: string;
  remite: string | null;
  destination: string;
  destinatario: string | null;
  driver_id: number;
  truck_id: number;
  cargo_type: string;
  kilos: number | null;
  field_values: string; // JSON
  status: TripStatus;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
  created_at: string;
  driver_name?: string;
  truck_plate?: string;
}

const SELECT = `
  SELECT t.id, t.template_id, t.provider_name, t.origin, t.remite, t.destination, t.destinatario,
         t.driver_id, t.truck_id, t.cargo_type, t.kilos, t.field_values, t.status,
         t.started_at, t.finished_at, t.notes, t.created_at,
         d.name AS driver_name, tr.plate AS truck_plate
  FROM trips t
  JOIN drivers d ON d.id = t.driver_id
  JOIN trucks tr ON tr.id = t.truck_id
`;

function toTrip(r: TripRow): Trip {
  let field_values: Record<string, string> = {};
  try {
    field_values = JSON.parse(r.field_values || "{}");
  } catch {
    field_values = {};
  }
  return {
    id: r.id,
    template_id: r.template_id,
    provider_name: r.provider_name,
    origin: r.origin,
    remite: r.remite,
    destination: r.destination,
    destinatario: r.destinatario,
    driver_id: r.driver_id,
    truck_id: r.truck_id,
    cargo_type: r.cargo_type,
    weight_tons: r.kilos,
    field_values,
    status: r.status,
    started_at: r.started_at,
    finished_at: r.finished_at,
    notes: r.notes,
    created_at: r.created_at,
    driver_name: r.driver_name,
    truck_plate: r.truck_plate,
  };
}

export interface TripFilters {
  driverId?: number;
  truckId?: number;
  status?: TripStatus;
  onlyDriverId?: number;
  provider?: string;
  from?: string;
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
  if (f.provider) {
    where.push("t.provider_name = ?");
    binds.push(f.provider);
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
  const { results } = await db.prepare(sql).bind(...binds).all<TripRow>();
  return (results ?? []).map(toTrip);
}

export async function getTrip(db: D1Database, id: number): Promise<Trip | null> {
  const r = await db.prepare(`${SELECT} WHERE t.id = ?`).bind(id).first<TripRow>();
  return r ? toTrip(r) : null;
}

export interface StartTripInput {
  template_id: number | null;
  provider_name: string;
  origin: string;
  remite: string | null;
  destination: string;
  destinatario: string | null;
  driver_id: number;
  truck_id: number;
  cargo_type: string;
  weight_tons: number | null;
  field_values: Record<string, string>;
}

export async function startTrip(db: D1Database, t: StartTripInput): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO trips (template_id, provider_name, origin, remite, destination, destinatario, driver_id, truck_id, cargo_type, kilos, field_values, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EN_CURSO')`,
    )
    .bind(
      t.template_id, t.provider_name, t.origin, t.remite, t.destination, t.destinatario, t.driver_id, t.truck_id,
      t.cargo_type, t.weight_tons, JSON.stringify(t.field_values ?? {}),
    )
    .run();
  return res.meta.last_row_id as number;
}

export async function finishTrip(
  db: D1Database,
  id: number,
  when: string,
  fieldValues: Record<string, string>,
  notes: string | null,
): Promise<void> {
  await db
    .prepare(
      "UPDATE trips SET status='COMPLETADO', finished_at=?, field_values=?, notes=? WHERE id=? AND status='EN_CURSO'",
    )
    .bind(when, JSON.stringify(fieldValues ?? {}), notes, id)
    .run();
}

export async function cancelTrip(db: D1Database, id: number, notes: string): Promise<void> {
  await db.prepare("UPDATE trips SET status='CANCELADO', notes=? WHERE id=?").bind(notes, id).run();
}

export async function activeTripForDriver(db: D1Database, driverId: number): Promise<Trip | null> {
  const r = await db
    .prepare(`${SELECT} WHERE t.driver_id = ? AND t.status = 'EN_CURSO' ORDER BY t.started_at DESC LIMIT 1`)
    .bind(driverId)
    .first<TripRow>();
  return r ? toTrip(r) : null;
}
