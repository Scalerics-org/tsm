import type { LecturaOdometro } from "../../shared/domain";

const SELECT = `
  SELECT l.*, tr.plate AS truck_plate, d.name AS driver_name
  FROM lecturas_odometro l
  JOIN trucks tr ON tr.id = l.truck_id
  LEFT JOIN drivers d ON d.id = l.driver_id
`;

export async function listLecturas(
  db: D1Database,
  opts: { truckId?: number; periodo?: string } = {},
): Promise<LecturaOdometro[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (opts.truckId != null) {
    where.push("l.truck_id = ?");
    binds.push(opts.truckId);
  }
  if (opts.periodo) {
    where.push("l.periodo = ?");
    binds.push(opts.periodo);
  }
  const sql =
    SELECT + (where.length ? ` WHERE ${where.join(" AND ")}` : "") + " ORDER BY l.periodo DESC";
  const { results } = await db.prepare(sql).bind(...binds).all<LecturaOdometro>();
  return results ?? [];
}

export async function getLectura(
  db: D1Database,
  truckId: number,
  periodo: string,
): Promise<LecturaOdometro | null> {
  return (
    (await db
      .prepare(`${SELECT} WHERE l.truck_id = ? AND l.periodo = ?`)
      .bind(truckId, periodo)
      .first<LecturaOdometro>()) ?? null
  );
}

export async function getLecturaPorId(db: D1Database, id: number): Promise<LecturaOdometro | null> {
  return (await db.prepare(`${SELECT} WHERE l.id = ?`).bind(id).first<LecturaOdometro>()) ?? null;
}

export interface LecturaInput {
  truck_id: number;
  periodo: string;
  kilometraje: number;
  /** Null cuando R2 no está bindeado: se guarda el número igual. */
  r2_key: string | null;
  driver_id: number | null;
}

export async function createLectura(db: D1Database, l: LecturaInput): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO lecturas_odometro (truck_id, periodo, kilometraje, r2_key, driver_id)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(l.truck_id, l.periodo, l.kilometraje, l.r2_key, l.driver_id)
    .run();
  // El odómetro del camión sólo sube, igual que al registrar una surtida: una lectura nueva
  // no puede saber menos que lo que ya quedó anotado por otro lado.
  await db
    .prepare("UPDATE trucks SET odometer_km = MAX(odometer_km, ?) WHERE id = ?")
    .bind(l.kilometraje, l.truck_id)
    .run();
  return res.meta.last_row_id as number;
}

/**
 * La oficina corrige el kilometraje de una lectura.
 *
 * La foto NO se toca: es la evidencia, y si se pudiera cambiar dejaría de servir para eso —
 * la misma regla que en las surtidas. Lo que sí se corrige es el número tipeado, porque un
 * dígito de más descuadra este mes y el siguiente (los dos usan esta lectura como extremo) y
 * el chofer no puede volver a cargarla: hay una sola por mes.
 */
export async function updateKilometraje(
  db: D1Database,
  id: number,
  kilometraje: number,
  editor: { userId: number; when: string },
): Promise<void> {
  await db
    .prepare(
      `UPDATE lecturas_odometro SET kilometraje = ?, edited_by = ?, edited_at = ? WHERE id = ?`,
    )
    .bind(kilometraje, editor.userId, editor.when, id)
    .run();
}
