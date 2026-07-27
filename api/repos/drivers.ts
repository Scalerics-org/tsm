import type { Driver } from "../../shared/domain";

export async function listDrivers(db: D1Database): Promise<Driver[]> {
  const { results } = await db.prepare("SELECT * FROM drivers ORDER BY name").all<Driver>();
  return results ?? [];
}

export async function getDriver(db: D1Database, id: number): Promise<Driver | null> {
  return (await db.prepare("SELECT * FROM drivers WHERE id = ?").bind(id).first<Driver>()) ?? null;
}

export type DriverInput = Omit<Driver, "id">;

export async function createDriver(db: D1Database, d: DriverInput): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO drivers (name, document, license_number, license_category, license_expiry, phone, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(d.name, d.document, d.license_number, d.license_category, d.license_expiry, d.phone, d.status)
    .run();
  return res.meta.last_row_id as number;
}

export async function updateDriver(db: D1Database, id: number, d: DriverInput): Promise<void> {
  await db
    .prepare(
      `UPDATE drivers SET name=?, document=?, license_number=?, license_category=?, license_expiry=?, phone=?, status=?
       WHERE id=?`,
    )
    .bind(d.name, d.document, d.license_number, d.license_category, d.license_expiry, d.phone, d.status, id)
    .run();
}

export async function deleteDriver(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM drivers WHERE id = ?").bind(id).run();
}
