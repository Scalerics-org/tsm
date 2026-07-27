import type { TripPosition } from "../../shared/domain";
import { robustPathKm } from "../../shared/geo";

export async function listPositions(db: D1Database, tripId: number): Promise<TripPosition[]> {
  const { results } = await db
    .prepare("SELECT * FROM trip_positions WHERE trip_id = ? ORDER BY seq ASC")
    .bind(tripId)
    .all<TripPosition>();
  return results ?? [];
}

export interface IncomingPoint {
  lat: number;
  lon: number;
  recorded_at: string;
}

/** Inserta un lote de puntos GPS, continuando la secuencia existente. */
export async function appendPositions(
  db: D1Database,
  tripId: number,
  points: IncomingPoint[],
): Promise<number> {
  if (points.length === 0) return 0;
  const last = await db
    .prepare("SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM trip_positions WHERE trip_id = ?")
    .bind(tripId)
    .first<{ maxSeq: number }>();
  let seq = last?.maxSeq ?? 0;

  const stmt = db.prepare(
    "INSERT INTO trip_positions (trip_id, lat, lon, recorded_at, seq) VALUES (?, ?, ?, ?, ?)",
  );
  const batch = points.map((p) => {
    seq += 1;
    return stmt.bind(tripId, p.lat, p.lon, p.recorded_at, seq);
  });
  await db.batch(batch);
  return seq;
}

/** Km recorridos según la traza GPS (Haversine, ignorando saltos implausibles). */
export async function distanceFromPositions(db: D1Database, tripId: number): Promise<number> {
  const points = await listPositions(db, tripId);
  return robustPathKm(points.map((p) => ({ lat: p.lat, lon: p.lon })));
}
