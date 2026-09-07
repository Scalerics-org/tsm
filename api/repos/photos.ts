import type { PhotoKind, TripPhoto } from "../../shared/domain";

/**
 * Las fotos de un viaje, en el orden en que se sacaron.
 *
 * El desempate por `id` no es decorativo. `taken_at` se guarda con precisión de segundo
 * (`api/routes/photos.ts` corta el ISO en 19 caracteres), así que dos fotos disparadas
 * seguidas caen en el mismo valor y ordenar sólo por ahí deja el empate a criterio de SQLite:
 * el orden puede cambiar entre dos consultas de las mismas fotos. Con una foto por viaje no
 * se notaba; con las cuatro hojas de una hoja de ruta la oficina no puede saber cuál es la
 * página 1.
 *
 * Va exportada para poder fijar eso en un test: es una regla que vive entera en el SQL y que
 * TypeScript no ve.
 */
export const SQL_FOTOS_DEL_VIAJE =
  "SELECT * FROM trip_photos WHERE trip_id = ? ORDER BY taken_at ASC, id ASC";

export async function listPhotos(db: D1Database, tripId: number): Promise<TripPhoto[]> {
  const { results } = await db.prepare(SQL_FOTOS_DEL_VIAJE).bind(tripId).all<TripPhoto>();
  return results ?? [];
}

export interface TripPhotoStatus {
  id: number;
  provider_name: string;
  origin: string;
  destination: string;
  driver_id: number;
  driver_name: string;
  arrival_photo_label: string | null;
  has_carga: number;
  has_descarga: number;
}

/** Estado de fotos por viaje (para alertas de fotos faltantes y cumplimiento). */
export async function tripPhotoStatus(
  db: D1Database,
  opts: { status?: string; driverId?: number } = {},
): Promise<TripPhotoStatus[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (opts.status) {
    where.push("t.status = ?");
    binds.push(opts.status);
  }
  if (opts.driverId != null) {
    where.push("t.driver_id = ?");
    binds.push(opts.driverId);
  }
  const sql = `
    SELECT t.id, t.provider_name, t.origin, t.destination, t.driver_id,
           d.name AS driver_name, tt.arrival_photo_label,
           COUNT(CASE WHEN p.kind='carga' THEN 1 END) AS has_carga,
           COUNT(CASE WHEN p.kind='descarga' THEN 1 END) AS has_descarga
    FROM trips t
    JOIN drivers d ON d.id = t.driver_id
    LEFT JOIN trip_templates tt ON tt.id = t.template_id
    LEFT JOIN trip_photos p ON p.trip_id = t.id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    GROUP BY t.id`;
  const { results } = await db.prepare(sql).bind(...binds).all<TripPhotoStatus>();
  return results ?? [];
}

export async function insertPhoto(
  db: D1Database,
  p: {
    trip_id: number;
    r2_key: string;
    kind: PhotoKind;
    taken_at: string;
    /** Carga a la que pertenece. `null` = foto del viaje entero. */
    segment_sid?: string | null;
  },
): Promise<number> {
  const res = await db
    .prepare(
      "INSERT INTO trip_photos (trip_id, r2_key, kind, taken_at, segment_sid) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(p.trip_id, p.r2_key, p.kind, p.taken_at, p.segment_sid ?? null)
    .run();
  return res.meta.last_row_id as number;
}

export async function getPhoto(db: D1Database, id: number): Promise<TripPhoto | null> {
  return (
    (await db
      .prepare("SELECT id, trip_id, r2_key, kind, taken_at, segment_sid FROM trip_photos WHERE id = ?")
      .bind(id)
      .first<TripPhoto>()) ?? null
  );
}

export async function deletePhoto(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM trip_photos WHERE id = ?").bind(id).run();
}
