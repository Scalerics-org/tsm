import type { PhotoKind, TripPhoto } from "../../shared/domain";

export async function listPhotos(db: D1Database, tripId: number): Promise<TripPhoto[]> {
  const { results } = await db
    .prepare("SELECT * FROM trip_photos WHERE trip_id = ? ORDER BY taken_at ASC")
    .bind(tripId)
    .all<TripPhoto>();
  return results ?? [];
}

export interface NewPhoto {
  trip_id: number;
  r2_key: string;
  kind: PhotoKind;
  taken_at: string;
  lat: number | null;
  lon: number | null;
}

export async function insertPhoto(db: D1Database, p: NewPhoto): Promise<number> {
  const res = await db
    .prepare(
      "INSERT INTO trip_photos (trip_id, r2_key, kind, taken_at, lat, lon) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(p.trip_id, p.r2_key, p.kind, p.taken_at, p.lat, p.lon)
    .run();
  return res.meta.last_row_id as number;
}
