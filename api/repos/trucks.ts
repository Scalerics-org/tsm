import type { Truck } from "../../shared/domain";

export async function listTrucks(db: D1Database): Promise<Truck[]> {
  const { results } = await db.prepare("SELECT * FROM trucks ORDER BY plate").all<Truck>();
  return results ?? [];
}

export async function getTruck(db: D1Database, id: number): Promise<Truck | null> {
  return (await db.prepare("SELECT * FROM trucks WHERE id = ?").bind(id).first<Truck>()) ?? null;
}

/**
 * Lo que manda el formulario de la oficina. `odometer_at` queda afuera a propósito: no la
 * elige nadie, la pone el repo cuando el odómetro cambia de verdad.
 */
export type TruckInput = Omit<Truck, "id" | "odometer_at">;

export async function createTruck(db: D1Database, t: TruckInput): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO trucks (plate, brand, model, year, type, capacity_kg, odometer_km, avg_km_litro, status, odometer_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? > 0 THEN datetime('now') END)`,
    )
    .bind(
      t.plate, t.brand, t.model, t.year, t.type, t.capacity_kg, t.odometer_km, t.avg_km_litro,
      t.status, t.odometer_km,
    )
    .run();
  return res.meta.last_row_id as number;
}

/**
 * Guarda el camión y, si el odómetro cambió, deja la fecha de esa edición.
 *
 * La fecha se mueve SÓLO cuando el número cambia. Si se moviera en cada guardado, cambiarle
 * la patente o el estado a un camión haría que su odómetro —quizás de hace meses— le ganara
 * a una surtida de ayer en la pantalla del chofer.
 *
 * En SQLite el lado derecho del SET lee los valores VIEJOS de la fila, así que el CASE
 * compara contra el odómetro que había antes de este UPDATE.
 */
export async function updateTruck(db: D1Database, id: number, t: TruckInput): Promise<void> {
  await db
    .prepare(
      `UPDATE trucks
          SET plate=?, brand=?, model=?, year=?, type=?, capacity_kg=?,
              odometer_at = CASE WHEN odometer_km = ? THEN odometer_at ELSE datetime('now') END,
              odometer_km=?, avg_km_litro=?, status=?
        WHERE id=?`,
    )
    .bind(
      t.plate, t.brand, t.model, t.year, t.type, t.capacity_kg,
      t.odometer_km, t.odometer_km, t.avg_km_litro, t.status, id,
    )
    .run();
}



export async function deleteTruck(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM trucks WHERE id = ?").bind(id).run();
}
