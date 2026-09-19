import type { HorasFrio, SurtidaFrio } from "../../shared/camara-frio";

/** Si el camión lleva cámara de frío. Un camión que no existe no la lleva. */
export async function tieneCamaraFrio(db: D1Database, truckId: number): Promise<boolean> {
  const row = await db
    .prepare("SELECT camara_frio FROM trucks WHERE id = ?")
    .bind(truckId)
    .first<{ camara_frio: number }>();
  return !!row?.camara_frio;
}

export async function listSurtidasFrio(db: D1Database, truckId: number): Promise<SurtidaFrio[]> {
  const { results } = await db
    .prepare(
      `SELECT s.*, d.name AS driver_name
         FROM surtidas_frio s
         LEFT JOIN drivers d ON d.id = s.driver_id
        WHERE s.truck_id = ?
        ORDER BY s.logged_at DESC, s.id DESC`,
    )
    .bind(truckId)
    .all<SurtidaFrio>();
  return results ?? [];
}

export async function getSurtidaFrio(db: D1Database, id: number): Promise<SurtidaFrio | null> {
  return (await db.prepare("SELECT * FROM surtidas_frio WHERE id = ?").bind(id).first<SurtidaFrio>()) ?? null;
}

export async function createSurtidaFrio(
  db: D1Database,
  s: { truck_id: number; driver_id: number | null; liters: number; r2_key_boleta: string | null },
): Promise<number> {
  const res = await db
    .prepare("INSERT INTO surtidas_frio (truck_id, driver_id, liters, r2_key_boleta) VALUES (?, ?, ?, ?)")
    .bind(s.truck_id, s.driver_id, s.liters, s.r2_key_boleta)
    .run();
  return res.meta.last_row_id as number;
}

/**
 * La oficina corrige los litros contra la boleta, y el día si se cargó con la fecha que no es
 * ("para permitir corregir las fechas" — Rodrigo, 19/9): el día decide en qué mes cuentan los
 * litros, y con eso los litros por hora. La hora se conserva, igual que en las surtidas del
 * camión. La foto no se toca: es la evidencia.
 */
export async function updateSurtidaFrio(
  db: D1Database,
  id: number,
  cambios: { liters: number; fecha: string | null },
  editor: { userId: number; when: string },
): Promise<void> {
  await db
    .prepare(
      `UPDATE surtidas_frio
          SET liters = ?,
              logged_at = CASE WHEN ? IS NULL THEN logged_at ELSE ? || substr(logged_at, 11) END,
              edited_by = ?, edited_at = ?
        WHERE id = ?`,
    )
    .bind(cambios.liters, cambios.fecha, cambios.fecha, editor.userId, editor.when, id)
    .run();
}

export async function deleteSurtidaFrio(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM surtidas_frio WHERE id = ?").bind(id).run();
}

export async function listHorasFrio(db: D1Database, truckId: number): Promise<HorasFrio[]> {
  const { results } = await db
    .prepare("SELECT mes, horas_inicio, horas_fin FROM horas_frio WHERE truck_id = ? ORDER BY mes DESC")
    .bind(truckId)
    .all<HorasFrio>();
  return results ?? [];
}

/** Guarda las dos horas del mes tal como vienen: mandar una en `null` la borra. */
export async function guardarHorasFrio(
  db: D1Database,
  truckId: number,
  h: HorasFrio,
  editor: { userId: number; when: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO horas_frio (truck_id, mes, horas_inicio, horas_fin, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (truck_id, mes) DO UPDATE
          SET horas_inicio = excluded.horas_inicio, horas_fin = excluded.horas_fin,
              updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    )
    .bind(truckId, h.mes, h.horas_inicio, h.horas_fin, editor.userId, editor.when)
    .run();
}
