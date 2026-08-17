import type { FuelLog } from "../../shared/domain";

const SELECT = `
  SELECT f.*, tr.plate AS truck_plate, d.name AS driver_name
  FROM fuel_logs f
  JOIN trucks tr ON tr.id = f.truck_id
  LEFT JOIN drivers d ON d.id = f.driver_id
`;

export async function listFuelLogs(
  db: D1Database,
  opts: { truckId?: number; from?: string; to?: string } = {},
): Promise<FuelLog[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (opts.truckId != null) {
    where.push("f.truck_id = ?");
    binds.push(opts.truckId);
  }
  if (opts.from) {
    where.push("substr(f.logged_at,1,10) >= ?");
    binds.push(opts.from);
  }
  if (opts.to) {
    where.push("substr(f.logged_at,1,10) <= ?");
    binds.push(opts.to);
  }
  const sql = SELECT + (where.length ? ` WHERE ${where.join(" AND ")}` : "") + " ORDER BY f.logged_at DESC";
  const { results } = await db.prepare(sql).bind(...binds).all<FuelLog>();
  return results ?? [];
}

export interface FuelInput {
  truck_id: number;
  driver_id: number | null;
  trip_id: number | null;
  odometer_km: number;
  liters: number;
  is_full: boolean;
  /** Foto del tacógrafo: respalda los km. */
  r2_key: string | null;
  /** Foto de la boleta de gasoil: respalda los litros. */
  r2_key_boleta: string | null;
}

export async function createFuelLog(db: D1Database, f: FuelInput): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO fuel_logs (truck_id, driver_id, trip_id, odometer_km, liters, is_full, r2_key, r2_key_boleta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      f.truck_id, f.driver_id, f.trip_id, f.odometer_km, f.liters,
      f.is_full ? 1 : 0, f.r2_key, f.r2_key_boleta,
    )
    .run();
  // Actualizar el odómetro del camión si esta lectura es más nueva/alta.
  await db
    .prepare("UPDATE trucks SET odometer_km = MAX(odometer_km, ?) WHERE id = ?")
    .bind(f.odometer_km, f.truck_id)
    .run();
  return res.meta.last_row_id as number;
}
