import type { FuelLog, OdometroCamion } from "../../shared/domain";

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

export async function getFuelLog(db: D1Database, id: number): Promise<FuelLog | null> {
  return (await db.prepare(`${SELECT} WHERE f.id = ?`).bind(id).first<FuelLog>()) ?? null;
}

/**
 * El odómetro que la oficina le cargó al camión, con la fecha en que lo tocó.
 *
 * La fecha es la mitad del dato: sin ella no se puede saber si la corrección de la oficina es
 * posterior a la última surtida, que es lo que decide qué ve el chofer. Se leen sólo esas dos
 * columnas y no el camión entero: esto lo consume la pantalla del chofer.
 */
export async function truckOdometer(db: D1Database, truckId: number): Promise<OdometroCamion> {
  const row = await db
    .prepare("SELECT odometer_km, odometer_at FROM trucks WHERE id = ?")
    .bind(truckId)
    .first<{ odometer_km: number; odometer_at: string | null }>();
  return { km: row?.odometer_km ?? 0, at: row?.odometer_at ?? null };
}

export interface FuelInput {
  truck_id: number;
  driver_id: number | null;
  trip_id: number | null;
  odometer_km: number;
  /** Total. Es de acá que sale todo el cálculo de consumo. */
  liters: number;
  /** Desglose por tanque. Null cuando no se sabe (surtidas viejas) o se cargó uno solo. */
  liters_tanque1: number | null;
  liters_tanque2: number | null;
  is_full: boolean;
  /** Foto del tacógrafo: respalda los km. */
  r2_key: string | null;
  /** Foto de la boleta de gasoil: respalda los litros. */
  r2_key_boleta: string | null;
}

export async function createFuelLog(db: D1Database, f: FuelInput): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO fuel_logs (truck_id, driver_id, trip_id, odometer_km, liters, liters_tanque1, liters_tanque2, is_full, r2_key, r2_key_boleta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      f.truck_id, f.driver_id, f.trip_id, f.odometer_km, f.liters,
      f.liters_tanque1, f.liters_tanque2,
      f.is_full ? 1 : 0, f.r2_key, f.r2_key_boleta,
    )
    .run();
  // Al registrar, el odómetro sólo sube: una surtida nueva no puede saber menos que el resto.
  // Y si lo sube, el número deja de ser lo que dijo la oficina: se le borra la fecha, para que
  // `kmInicialTacografo` no trate una lectura del surtidor como una corrección de escritorio.
  await db
    .prepare(
      `UPDATE trucks
          SET odometer_at = CASE WHEN ? > odometer_km THEN NULL ELSE odometer_at END,
              odometer_km = MAX(odometer_km, ?)
        WHERE id = ?`,
    )
    .bind(f.odometer_km, f.odometer_km, f.truck_id)
    .run();
  return res.meta.last_row_id as number;
}

/** Lo que la oficina puede corregir de una surtida. Las fotos no se tocan: son la evidencia. */
export interface FuelPatch {
  odometer_km: number;
  liters: number;
  liters_tanque1: number | null;
  liters_tanque2: number | null;
  is_full: boolean;
}

export async function updateFuelLog(
  db: D1Database,
  id: number,
  p: FuelPatch,
  editor: { userId: number; when: string },
): Promise<void> {
  const previa = await getFuelLog(db, id);
  await db
    .prepare(
      `UPDATE fuel_logs
       SET odometer_km = ?, liters = ?, liters_tanque1 = ?, liters_tanque2 = ?, is_full = ?,
           edited_by = ?, edited_at = ?
       WHERE id = ?`,
    )
    .bind(
      p.odometer_km, p.liters, p.liters_tanque1, p.liters_tanque2, p.is_full ? 1 : 0,
      editor.userId, editor.when, id,
    )
    .run();
  if (previa) await recalcularOdometro(db, previa.truck_id, previa.odometer_km);
}

export async function deleteFuelLog(db: D1Database, id: number): Promise<number | null> {
  const previa = await getFuelLog(db, id);
  if (!previa) return null;
  await db.prepare("DELETE FROM fuel_logs WHERE id = ?").bind(id).run();
  await recalcularOdometro(db, previa.truck_id, previa.odometer_km);
  return previa.truck_id;
}

/**
 * Recalcula el odómetro del camión después de corregir o borrar una surtida.
 *
 * Sólo interviene si el odómetro del camión ERA el de esa surtida — es decir, si esa lectura
 * es la que lo dejó donde está. Así, corregir un 990.000 tipeado de más lo baja de verdad
 * (que es para lo que el cliente pidió poder corregir), pero un odómetro cargado a mano por
 * la oficina, o puesto por otra surtida más alta, no se toca.
 *
 * Sin esa condición esto era destructivo: en producción, GTP 4382 tiene el odómetro en
 * 354.537 y su surtida más alta es de 98.700 —una que quedó del sembrado de demo—, así que
 * un recálculo a ciegas le borraba 255.837 km.
 */
async function recalcularOdometro(db: D1Database, truckId: number, odometroPrevio: number): Promise<void> {
  await db
    .prepare(
      `UPDATE trucks
       SET odometer_km = COALESCE((SELECT MAX(odometer_km) FROM fuel_logs WHERE truck_id = ?), odometer_km),
           odometer_at = NULL
       WHERE id = ? AND odometer_km = ?`,
    )
    .bind(truckId, truckId, odometroPrevio)
    .run();
}
