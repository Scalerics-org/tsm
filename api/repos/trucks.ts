import type { Truck } from "../../shared/domain";

export async function listTrucks(db: D1Database): Promise<Truck[]> {
  const { results } = await db.prepare("SELECT * FROM trucks ORDER BY plate").all<Truck>();
  return results ?? [];
}

export async function getTruck(db: D1Database, id: number): Promise<Truck | null> {
  return (await db.prepare("SELECT * FROM trucks WHERE id = ?").bind(id).first<Truck>()) ?? null;
}

export type TruckInput = Omit<Truck, "id">;

export async function createTruck(db: D1Database, t: TruckInput): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO trucks (plate, brand, model, year, type, capacity_kg, odometer_km, avg_km_litro, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(t.plate, t.brand, t.model, t.year, t.type, t.capacity_kg, t.odometer_km, t.avg_km_litro, t.status)
    .run();
  return res.meta.last_row_id as number;
}

export async function updateTruck(db: D1Database, id: number, t: TruckInput): Promise<void> {
  await db
    .prepare(
      `UPDATE trucks SET plate=?, brand=?, model=?, year=?, type=?, capacity_kg=?, odometer_km=?, avg_km_litro=?, status=?
       WHERE id=?`,
    )
    .bind(t.plate, t.brand, t.model, t.year, t.type, t.capacity_kg, t.odometer_km, t.avg_km_litro, t.status, id)
    .run();
}

export async function setTruckStatus(db: D1Database, id: number, status: Truck["status"]): Promise<void> {
  await db.prepare("UPDATE trucks SET status=? WHERE id=?").bind(status, id).run();
}

export async function addOdometer(db: D1Database, id: number, km: number): Promise<void> {
  await db.prepare("UPDATE trucks SET odometer_km = odometer_km + ? WHERE id=?").bind(km, id).run();
}

export async function deleteTruck(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM trucks WHERE id = ?").bind(id).run();
}
