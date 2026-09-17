import type { Truck } from "../../shared/domain";
import type { AtadoAlCamion } from "../lib/frenos-de-borrado";

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
      `INSERT INTO trucks (plate, brand, model, year, type, capacity_kg, odometer_km, avg_km_litro, status, camara_frio, odometer_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? > 0 THEN datetime('now') END)`,
    )
    .bind(
      t.plate, t.brand, t.model, t.year, t.type, t.capacity_kg, t.odometer_km, t.avg_km_litro,
      t.status, t.camara_frio ? 1 : 0, t.odometer_km,
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
              odometer_km=?, avg_km_litro=?, status=?, camara_frio=?
        WHERE id=?`,
    )
    .bind(
      t.plate, t.brand, t.model, t.year, t.type, t.capacity_kg,
      t.odometer_km, t.odometer_km, t.avg_km_litro, t.status, t.camara_frio ? 1 : 0, id,
    )
    .run();
}

/** Lo que frenaría —o se llevaría puesto— el borrado de este camión. */
export async function loAtadoAlCamion(db: D1Database, id: number): Promise<AtadoAlCamion> {
  const row = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM trips WHERE truck_id = ?)             AS viajes,
              (SELECT COUNT(*) FROM fuel_logs WHERE truck_id = ?)
                + (SELECT COUNT(*) FROM surtidas_frio WHERE truck_id = ?) AS surtidas,
              (SELECT COUNT(*) FROM lecturas_odometro WHERE truck_id = ?) AS lecturas,
              (SELECT COUNT(*) FROM drivers
                 WHERE default_truck_id = ? AND status = 'activo')          AS choferes`,
    )
    .bind(id, id, id, id, id)
    .first<AtadoAlCamion>();
  return row ?? { viajes: 0, surtidas: 0, lecturas: 0, choferes: 0 };
}

/** Los viajes que ve el camión (`camion_plantillas`). Vacío = ve lo de siempre. */
export async function plantillasDelCamion(db: D1Database, truckId: number | null | undefined): Promise<number[]> {
  if (truckId == null) return [];
  const { results } = await db
    .prepare("SELECT template_id FROM camion_plantillas WHERE truck_id = ? ORDER BY template_id")
    .bind(truckId)
    .all<{ template_id: number }>();
  return (results ?? []).map((r) => r.template_id);
}

/** Reemplaza la lista entera. Una lista vacía devuelve el camión a ver lo de siempre. */
export async function guardarPlantillasDelCamion(db: D1Database, truckId: number, ids: number[]): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM camion_plantillas WHERE truck_id = ?").bind(truckId),
    ...ids.map((t) =>
      db.prepare("INSERT OR IGNORE INTO camion_plantillas (truck_id, template_id) VALUES (?, ?)").bind(truckId, t),
    ),
  ]);
}

export async function deleteTruck(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM trucks WHERE id = ?").bind(id).run();
}
